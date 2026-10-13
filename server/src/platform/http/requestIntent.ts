import { createHash } from 'node:crypto';
import type { Request } from 'express';

/** Object key order is irrelevant; array order, exact path and supplied values are intent. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

/** Persist only the digest: retries cannot change their target or effects under an old UUID. */
export function requestIntentHash(req: Pick<Request, 'method' | 'originalUrl' | 'query' | 'body' | 'requestedEvent'>): string {
  const path = canonicalIntentPath(req);
  const intent = [req.method, path, canonical(req.query), canonical(req.body)];
  return createHash('sha256').update(JSON.stringify(intent)).digest('hex');
}

/** The reviewed Event #1 compatibility alias names the same target (ADR-009 §6). */
function canonicalIntentPath(req: Pick<Request, 'originalUrl' | 'requestedEvent'>): string {
  const path = req.originalUrl.split('?')[0] ?? '';
  if (req.requestedEvent && !req.requestedEvent.fromPath && path.startsWith('/api/v1/'))
    return `/api/v1/events/${req.requestedEvent.eventId}${path.slice('/api/v1'.length)}`;
  return path;
}
