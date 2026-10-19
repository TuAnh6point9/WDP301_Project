import type { Request, RequestHandler } from 'express';
import { AuditLog } from './audit.model.js';

type Entry = { action: string; actorId: string | null; target: string | null; outcome: 'success' | 'failure'; status: number; requestId: string };
/** Logging must never change the response of the request being logged. */
export async function recordAudit(entry: Entry) {
  try { await AuditLog.create(entry); }
  catch (error) { console.error(JSON.stringify({ requestId: entry.requestId, event: 'audit_failed', error: error instanceof Error ? error.name : 'UnknownError' })); }
}
/** Records the action once the response is sent, so failures (4xx/5xx) are logged too. */
export const audited = (action: string | ((req: Request) => string)): RequestHandler => (req, res, next) => {
  const name = typeof action === 'string' ? action : action(req);
  // Read now: Express resets req.params when an error leaves the router.
  const routeId = typeof req.params.id === 'string' ? req.params.id : null;
  res.on('finish', () => void recordAudit({
    action: name, actorId: res.locals.auditActor ?? res.locals.user?._id ?? null,
    target: res.locals.auditTarget ?? routeId,
    outcome: res.statusCode < 400 ? 'success' : 'failure', status: res.statusCode, requestId: res.locals.requestId,
  }));
  next();
};
