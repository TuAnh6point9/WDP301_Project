import { lookup as systemLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { isIP } from 'node:net';

type Answer = { type: number; data: string; TTL?: number };
type DnsResponse = { Status: number; Answer?: Answer[] };
type Query = (name: string, type: 'SRV' | 'TXT' | 'A' | 'AAAA') => Promise<Answer[]>;
const DNS_CODES = new Set(['ENODATA', 'ENOTFOUND', 'ETIMEOUT', 'EAI_AGAIN', 'ESERVFAIL', 'ECONNREFUSED']);

/** Do not retry authentication, TLS, validation or general connectivity failures as DNS failures. */
export function isDnsFailure(error: unknown): boolean {
  const seen = new Set<unknown>();
  function visit(value: unknown): boolean {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    const e = value as { code?: string; syscall?: string; cause?: unknown; reason?: unknown; servers?: Map<string, { error?: unknown }> };
    if (e.code && DNS_CODES.has(e.code) && (e.code !== 'ECONNREFUSED' || /query|resolve/.test(e.syscall ?? ''))) return true;
    return visit(e.cause) || visit(e.reason) || (e.servers instanceof Map && [...e.servers.values()].some(server => visit(server.error)));
  }
  return visit(error);
}

export function isAtlasSrvUri(uri: string): boolean {
  try { const url = new URL(uri); return url.protocol === 'mongodb+srv:' && url.hostname.toLowerCase().endsWith('.mongodb.net'); }
  catch { return false; }
}

/** Only public Atlas DNS names are sent to the fixed HTTPS resolver, never credentials or the URI. */
export function createHttpsDnsQuery(request: typeof fetch = fetch): Query {
  const cache = new Map<string, { until: number; answer: Answer[] }>();
  return async (name, type) => {
    if (!/^(?:_mongodb\._tcp\.)?[a-z0-9.-]+\.mongodb\.net$/i.test(name)) throw new Error('DNS fallback is restricted to Atlas hosts.');
    const key = `${name}:${type}`, cached = cache.get(key);
    if (cached && cached.until > Date.now()) return cached.answer;
    try {
      const url = new URL('https://dns.google/resolve');
      url.searchParams.set('name', name); url.searchParams.set('type', type);
      const response = await request(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) throw new Error('DNS resolver rejected the query.');
      const body = await response.json() as DnsResponse;
      // No TXT/AAAA record is valid; NXDOMAIN for SRV/A must still fail closed.
      if (body.Status === 3 && (type === 'TXT' || type === 'AAAA')) return [];
      if (body.Status !== 0 || (body.Answer && !Array.isArray(body.Answer))) throw new Error('Invalid DNS answer.');
      const answer = body.Answer ?? [];
      const ttl = Math.min(300, ...answer.map(record => Math.max(0, Number(record.TTL) || 0)));
      cache.set(key, { until: Date.now() + ttl * 1000, answer });
      return answer;
    } catch { throw new Error('Atlas DNS-over-HTTPS lookup failed. Check DNS/network settings.'); }
  };
}

function decodeTxt(text: string): string {
  // Google's JSON resolver can return either presentation-format quoted chunks or an unquoted value.
  if (!text.includes('"')) return text;
  const parts = text.match(/"(?:[^"\\]|\\.)*"/g);
  if (!parts || text.replace(/"(?:[^"\\]|\\.)*"/g, '').trim()) throw new Error('Invalid Atlas TXT record.');
  return parts.map(part => JSON.parse(part) as string).join('');
}

/** Resolve fresh seeds after a DNS-only failure. TLS remains on and SRV targets must share the parent domain. */
export async function resolveAtlasSeeds(uri: string, query: Query = createHttpsDnsQuery()): Promise<string> {
  if (!isAtlasSrvUri(uri)) throw new Error('DNS fallback requires an Atlas SRV URI.');
  const url = new URL(uri);
  const hostname = url.hostname.toLowerCase();
  const options = new URLSearchParams(url.search);
  const userOptions = new Set([...options.keys()].map(key => key.toLowerCase()));
  if (userOptions.has('srvmaxhosts') || userOptions.has('srvservicename')) throw new Error('DNS fallback does not support custom SRV options.');
  for (const [key, value] of options) {
    const option = key.toLowerCase();
    if ((['tls', 'ssl'].includes(option) && value !== 'true') || (['tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames'].includes(option) && value !== 'false')) {
      throw new Error('Atlas DNS fallback requires verified TLS.');
    }
  }
  const [srvAnswer, txtAnswer] = await Promise.all([query(`_mongodb._tcp.${hostname}`, 'SRV'), query(hostname, 'TXT')]);
  const srv = srvAnswer.filter(record => record.type === 33), txt = txtAnswer.filter(record => record.type === 16);
  if (!srv.length || srv.length > 32 || txt.length > 1) throw new Error('Invalid Atlas seed records.');
  const parent = hostname.split('.').slice(1).join('.');
  const hosts = srv.map(record => {
    const fields = record.data.trim().split(/\s+/);
    const port = Number(fields[2]), host = fields[3]?.replace(/\.$/, '').toLowerCase();
    if (fields.length !== 4 || !Number.isInteger(port) || port < 1 || port > 65535 || !host || !/^[a-z0-9.-]+$/.test(host) || !host.endsWith(`.${parent}`)) {
      throw new Error('Untrusted Atlas SRV target.');
    }
    return `${host}:${port}`;
  });
  if (txt.length) {
    const seen = new Set<string>();
    for (const [key, value] of new URLSearchParams(decodeTxt(txt[0].data))) {
      const option = key.toLowerCase();
      if (!['authsource', 'replicaset', 'loadbalanced'].includes(option) || seen.has(option)) throw new Error('Unsupported Atlas TXT option.');
      seen.add(option);
      if (!userOptions.has(option)) options.set(key, value);
    }
  }
  if (!userOptions.has('tls') && !userOptions.has('ssl')) options.set('tls', 'true');
  const authority = uri.slice('mongodb+srv://'.length).split(/[/?#]/, 1)[0];
  const credentials = authority.includes('@') ? authority.slice(0, authority.lastIndexOf('@') + 1) : '';
  return `mongodb://${credentials}${hosts.join(',')}${url.pathname || '/'}?${options}`;
}

/** A per-client lookup, not a process-wide DNS monkey patch or a Windows DNS change. */
export function createAtlasLookup(query: Query = createHttpsDnsQuery(), lookupSystem: typeof systemLookup = systemLookup): typeof systemLookup {
  type Callback = (error: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;
  const lookup = (host: string, options: LookupOptions | number | Callback, callback?: Callback) => {
    const done = (typeof options === 'function' ? options : callback)!;
    const settings: LookupOptions = typeof options === 'function' ? {} : typeof options === 'number' ? { family: options } : options ?? {};
    const deliver = (addresses: LookupAddress[]) => settings.all ? done(null, addresses) : done(null, addresses[0].address, addresses[0].family);
    lookupSystem(host, { ...settings, all: true }, (error, addresses) => {
      if (!error) return deliver(addresses);
      if (!isDnsFailure(error) || !host.endsWith('.mongodb.net')) return done(error);
      const wanted = settings.family === 6 ? 6 : 4;
      void query(host, wanted === 6 ? 'AAAA' : 'A').then(answer => {
        const resolved: LookupAddress[] = answer.filter(record => record.type === (wanted === 6 ? 28 : 1) && isIP(record.data) === wanted).map(record => ({ address: record.data, family: wanted }));
        if (!resolved.length) return done(error);
        deliver(resolved);
      }, () => done(error));
    });
  };
  return lookup as typeof systemLookup;
}
