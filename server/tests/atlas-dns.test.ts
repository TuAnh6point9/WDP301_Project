import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dns from 'node:dns';
import { createAtlasLookup, createHttpsDnsQuery, isAtlasSrvUri, isDnsFailure, resolveAtlasSeeds } from '../src/config/atlas-dns.js';

const uri = 'mongodb+srv://reader:p%40ss@cluster.example.mongodb.net/akh_wqi?retryWrites=true&appName=WQI';
const answer = { SRV: [{ type: 33, data: '0 0 27017 shard.example.mongodb.net.' }], TXT: [{ type: 16, data: '"authSource=admin&replicaSet=rs0"' }] };
const query = vi.fn(async (_host: string, type: string) => answer[type as keyof typeof answer] ?? []);
afterEach(() => { vi.restoreAllMocks(); query.mockClear(); });

describe('Atlas DNS fallback', () => {
  it('restricts fallback to public Atlas SRV names and DNS failures', () => {
    expect(isAtlasSrvUri(uri)).toBe(true);
    expect(isAtlasSrvUri('mongodb://127.0.0.1/test')).toBe(false);
    expect(isAtlasSrvUri('mongodb+srv://private.internal/test')).toBe(false);
    expect(isDnsFailure({ code: 'ENODATA', syscall: 'querySrv' })).toBe(true);
    expect(isDnsFailure({ reason: { servers: new Map([['s', { error: { cause: { code: 'ENOTFOUND' } } }]]) } })).toBe(true);
    expect(isDnsFailure({ code: 18 })).toBe(false);
    expect(isDnsFailure({ code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' })).toBe(false);
    expect(isDnsFailure({ code: 'ECONNREFUSED', syscall: 'connect' })).toBe(false);
  });
  it('preserves encoded credentials, database and query options, applies TXT and enables verified TLS', async () => {
    const resolved = await resolveAtlasSeeds(uri, query);
    expect(resolved).toContain('mongodb://reader:p%40ss@shard.example.mongodb.net:27017/akh_wqi?');
    const options = new URLSearchParams(resolved.split('?')[1]);
    expect(Object.fromEntries(options)).toMatchObject({ retryWrites: 'true', appName: 'WQI', authSource: 'admin', replicaSet: 'rs0', tls: 'true' });
    expect(query.mock.calls.every(([host]) => !host.includes('reader') && !host.includes('p%40ss') && !host.includes('akh_wqi'))).toBe(true);
  });
  it('gives explicit URI options precedence over TXT options case-insensitively', async () => {
    const resolved = await resolveAtlasSeeds(uri + '&AUTHSOURCE=custom&tls=true', query);
    expect(resolved).toContain('AUTHSOURCE=custom'); expect(resolved).not.toContain('authSource=admin');
  });
  it('normalizes mixed-case Atlas hostnames before validating SRV targets', async () => {
    const resolved = await resolveAtlasSeeds(uri.replace('cluster.example.mongodb.net', 'CLUSTER.EXAMPLE.MONGODB.NET'), query);
    expect(resolved).toContain('shard.example.mongodb.net:27017');
  });
  it('accepts unquoted TXT values and joins quoted DNS chunks', async () => {
    for (const data of ['authSource=admin&replicaSet=rs0', '"authSource=" "admin&replicaSet=rs0"']) {
      const resolved = await resolveAtlasSeeds(uri, async (_n, t) => t === 'SRV' ? answer.SRV : [{ type: 16, data }]);
      expect(resolved).toContain('authSource=admin');
    }
  });
  it.each(['&tls=false', '&ssl=false', '&tlsAllowInvalidCertificates=true', '&tlsInsecure=true', '&srvMaxHosts=1'])(
    'refuses unsafe or unsupported fallback option %s', async option => {
      await expect(resolveAtlasSeeds(uri + option, query)).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    },
  );
  it.each(['0 0 27017 evil.example.org.', '0 0 0 shard.example.mongodb.net.', '0 0 27017 example.mongodb.net.', 'not an SRV record'])(
    'rejects untrusted SRV target %s', async data => {
      await expect(resolveAtlasSeeds(uri, async (_name, type) => type === 'SRV' ? [{ type: 33, data }] : [])).rejects.toThrow();
    },
  );
  it('rejects missing seeds, multiple TXT records and TXT options that could weaken TLS', async () => {
    await expect(resolveAtlasSeeds(uri, async () => [])).rejects.toThrow();
    await expect(resolveAtlasSeeds(uri, async (_n, t) => t === 'SRV' ? answer.SRV : [...answer.TXT, ...answer.TXT])).rejects.toThrow();
    await expect(resolveAtlasSeeds(uri, async (_n, t) => t === 'SRV' ? answer.SRV : [{ type: 16, data: '"tls=false"' }])).rejects.toThrow();
  });
  it('uses bounded HTTPS requests, never redirects, and caches only for the DNS TTL', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '192.0.2.1', TTL: 60 }] }), { status: 200 }));
    const resolve = createHttpsDnsQuery(request);
    await resolve('shard.example.mongodb.net', 'A'); await resolve('shard.example.mongodb.net', 'A');
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url.origin).toBe('https://dns.google');
    expect(url.searchParams.get('name')).toBe('shard.example.mongodb.net');
    expect(options.redirect).toBe('error'); expect(options.signal).toBeInstanceOf(AbortSignal);
    await expect(resolve('private.internal', 'A')).rejects.toThrow();
  });
  it('does not leak resolver errors or accept an HTTP error as DNS data', async () => {
    const resolve = createHttpsDnsQuery(vi.fn().mockRejectedValue(new Error('sensitive transport detail')));
    await expect(resolve('shard.example.mongodb.net', 'A')).rejects.toThrow('Atlas DNS-over-HTTPS lookup failed');
    const rejected = createHttpsDnsQuery(vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(rejected('shard.example.mongodb.net', 'A')).rejects.toThrow();
  });
  it('provides per-client all:true lookups without replacing global DNS functions', async () => {
    const system = vi.fn((...args: unknown[]) => {
      const cb = args[2] as (error: NodeJS.ErrnoException) => void;
      cb(Object.assign(new Error('DNS unavailable'), { code: 'ENODATA' }));
    }) as unknown as typeof dns.lookup;
    const before = dns.lookup;
    const lookup = createAtlasLookup(async () => [{ type: 1, data: '192.0.2.1' }], system);
    const addresses = await new Promise((resolve, reject) => lookup('shard.example.mongodb.net', { all: true }, (error, value) => error ? reject(error) : resolve(value)));
    expect(addresses).toEqual([{ address: '192.0.2.1', family: 4 }]);
    expect(dns.lookup).toBe(before);
  });
});
