import type { Request } from 'express';
import { ERROR_CODES } from '@spoh/shared';
import { recordSecurityEvent, type AuditAction } from '../lib/audit.js';
import { auditContextFrom } from '../lib/requestContext.js';

/**
 * Turning a refused request into an audit row (BUILD_PLAN §8.7).
 *
 * The change log answers "who altered this record". This answers the other
 * half — who was told no, and how often. A single 401 is a phone that slept
 * through its token expiry; two hundred from one address in a minute is the
 * thing you wanted a log for.
 *
 * ── Why this is throttled ───────────────────────────────────────────────────
 *
 * Recording every refusal verbatim hands an unauthenticated caller a write
 * primitive: a loop against a 401 endpoint would fill the audit table faster
 * than the event fills it in a day, and the table that is supposed to explain
 * the incident becomes the incident. So identical refusals from the same
 * origin collapse into one row per window, carrying the count of what they
 * stood in for. Nothing is lost that a reader would have used — two hundred
 * identical lines say exactly what "×200" says.
 */

/** How long identical refusals collapse into one row. */
const DEDUPE_WINDOW_MS = 60_000;
/** Ceiling on distinct keys tracked at once, so the map cannot grow unbounded. */
const MAX_TRACKED_KEYS = 5_000;

interface Window {
  /** When the row that represents this window was written. */
  openedAt: number;
  /** Refusals seen since, including the one that opened it. */
  count: number;
}

const windows = new Map<string, Window>();

/**
 * Requests already recorded by a more specific call site.
 *
 * `assertTrustedOrigin` records its own CRITICAL row and then throws a plain
 * 403, which the error handler would otherwise file a second time as an
 * ordinary `rbac.denied`. A WeakSet rather than a flag on the request so no
 * Express type has to learn about this module.
 */
const alreadyAudited = new WeakSet<Request>();

/**
 * Map an HTTP refusal onto the action that describes it.
 *
 * Returns null for everything that is not security-relevant — a 404 for a
 * mistyped card code is not an event, and recording it would bury the ones
 * that are.
 */
function actionFor(statusCode: number, code: string): AuditAction | null {
  if (statusCode === 429) return 'rateLimit.exceeded';
  if (statusCode >= 500) return 'system.error';

  if (statusCode === 401) {
    return code === ERROR_CODES.SESSION_REUSE_DETECTED ? 'session.reuseDetected' : 'auth.denied';
  }

  if (statusCode === 403) {
    switch (code) {
      case ERROR_CODES.STATION_SCOPE_DENIED:
        return 'rbac.stationScopeDenied';
      case ERROR_CODES.NOT_PROVISIONED:
      case ERROR_CODES.ACCOUNT_INACTIVE:
        return 'auth.noRosterRow';
      default:
        return 'rbac.denied';
    }
  }

  return null;
}

/**
 * The dedupe key.
 *
 * Keyed on the actor where there is one and the IP otherwise, because the
 * interesting pattern is "one caller, many refusals" — keying on the path
 * alone would merge two unrelated people and keying on the request id would
 * merge nothing at all. The route pattern rather than the URL keeps
 * `/cards/A1`, `/cards/A2`, … from each opening their own window during a scan.
 */
function keyFor(req: Request, action: AuditAction): string {
  const actor = req.auth?.sub ?? `ip:${req.ip ?? 'unknown'}`;
  const route = req.route?.path ?? req.baseUrl ?? req.path;
  return `${action}|${actor}|${req.method}|${route}`;
}

/** Drop windows that have closed. Cheap, and only runs when the map is large. */
function evictExpired(now: number): void {
  for (const [key, window] of windows) {
    if (now - window.openedAt >= DEDUPE_WINDOW_MS) windows.delete(key);
  }
}

/**
 * Record a refusal, if it is one worth recording.
 *
 * Safe to call on every error response: it decides for itself whether the
 * status warrants a row, and it never throws or awaits.
 */
export function auditRefusal(
  req: Request,
  statusCode: number,
  code: string,
  message?: string,
): void {
  if (alreadyAudited.has(req)) return;

  const action = actionFor(statusCode, code);
  if (!action) return;

  const now = Date.now();
  const key = keyFor(req, action);
  const open = windows.get(key);

  if (open && now - open.openedAt < DEDUPE_WINDOW_MS) {
    open.count += 1;
    return;
  }

  // The window that just closed stood for `count` refusals; say so on the row
  // that opens the next one, so the total is recoverable from the log alone.
  const suppressed = open ? open.count - 1 : 0;

  if (windows.size >= MAX_TRACKED_KEYS) evictExpired(now);
  // Still full — every tracked key is live. Drop the oldest rather than stop
  // tracking, so a flood cannot switch deduplication off for everyone else.
  if (windows.size >= MAX_TRACKED_KEYS) {
    const oldest = windows.keys().next();
    if (!oldest.done) windows.delete(oldest.value);
  }

  windows.set(key, { openedAt: now, count: 1 });

  recordSecurityEvent({
    ...auditContextFrom(req),
    action,
    entityType: 'Request',
    entityId: null,
    method: req.method,
    // `originalUrl` minus the query string: a query can carry a card code or
    // an email, and this table is read by more people than the row's subject.
    path: req.originalUrl.split('?')[0] ?? req.path,
    statusCode,
    after: {
      code,
      ...(message ? { message } : {}),
      ...(suppressed > 0 ? { suppressedInPreviousWindow: suppressed } : {}),
      ...(req.auth ? { role: req.auth.role } : {}),
    },
  });
}

/**
 * A state-changing auth request from an origin we do not serve.
 *
 * Its own action rather than a generic 403: this one is never a
 * misconfiguration on our side, so it is graded CRITICAL and should not be
 * collapsed into the ordinary capability denials.
 */
export function auditUntrustedOrigin(req: Request, origin: string): void {
  alreadyAudited.add(req);

  recordSecurityEvent({
    ...auditContextFrom(req),
    action: 'auth.untrustedOrigin',
    entityType: 'Request',
    entityId: null,
    method: req.method,
    path: req.originalUrl.split('?')[0] ?? req.path,
    statusCode: 403,
    after: { origin },
  });
}

/** Test seam: windows are process-global and would leak between cases. */
export function resetSecurityAuditWindows(): void {
  windows.clear();
}
