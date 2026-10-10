import type { Request } from 'express';
import { writeAudit } from '../audit/index.js';
import { prisma } from '../db/client.js';
import { logger } from '../logger/index.js';
import { auditContextFrom } from './auditContext.js';

/**
 * Denials in the security audit (P11.5): who was refused what, and which policies decided it.
 *
 * A screen that polls a route its reader may not use is refused every few seconds, and a
 * row each time would make the audit table the incident. Identical denials (one caller,
 * one route) within a minute collapse into one row; the next window's row says how many it
 * stood for. The window is per process, as the rate limits are, until P15.2 moves both to
 * Postgres (F03-042).
 *
 * Fire-and-forget: nothing changed, so there is no transaction to join, and a failing
 * database must not turn a 403 into a 500. Every denial is also logged.
 */

const WINDOW_MS = 60_000;
/** Distinct callers and routes tracked at once, so a flood cannot grow the map unbounded. */
const MAX_KEYS = 5_000;

interface Window {
  readonly openedAt: number;
  count: number;
}

const windows = new Map<string, Window>();
/**
 * Audit writes not yet settled, so a test can wait for them before it resets the database.
 * One set per process, even when a test loads the app twice (`vi.resetModules`).
 */
const PENDING = Symbol.for('@spoh/server/authorizationDenials.pending');
const pending: Set<Promise<void>> = ((globalThis as Record<symbol, unknown>)[PENDING] ??= new Set<
  Promise<void>
>()) as Set<Promise<void>>;

export interface Denial {
  /** Method and pattern, not the URL, so `/cards/A1` and `/cards/A2` share a window. */
  readonly route: string;
  /** The pattern alone, for the audit row's path. */
  readonly path: string;
  readonly actions: readonly string[];
  readonly policies: readonly string[];
}

export function recordDenial(req: Request, denial: Denial): void {
  logger.warn(
    { authorization: { ...denial, role: req.auth?.role, membershipId: req.auth?.membershipId } },
    'authorization denied',
  );
  const suppressed = openWindow(`${req.auth?.sub ?? `ip:${req.ip ?? 'unknown'}`}|${denial.route}`);
  if (suppressed === null) return;
  const write = writeAudit(prisma, {
    ...auditContextFrom(req),
    action: 'authorization.denied',
    severity: 'WARNING',
    outcome: 'DENIED',
    entityType: 'Route',
    entityId: denial.route,
    after: {
      actions: [...denial.actions],
      policies: [...denial.policies],
      ...(suppressed > 0 ? { previousWindowSuppressed: suppressed } : {}),
    },
    method: req.method,
    path: denial.path,
    statusCode: 403,
  })
    .catch((error: unknown) => {
      logger.error({ err: error, route: denial.route }, 'failed to record an authorization denial');
    })
    .finally(() => pending.delete(write));
  pending.add(write);
}

/**
 * Counts a denial into its window. Null while the window is open; when it opens a new one,
 * how many denials the window before stood for beyond its own row.
 */
function openWindow(key: string): number | null {
  const now = Date.now();
  const open = windows.get(key);
  if (open && now - open.openedAt < WINDOW_MS) {
    open.count += 1;
    return null;
  }
  if (windows.size >= MAX_KEYS) evict(now);
  windows.set(key, { openedAt: now, count: 1 });
  return open ? open.count - 1 : 0;
}

/** Closed windows first; if every window is live, the oldest, so dedupe never switches off. */
function evict(now: number): void {
  for (const [key, window] of windows) {
    if (now - window.openedAt >= WINDOW_MS) windows.delete(key);
  }
  if (windows.size >= MAX_KEYS) {
    const oldest = windows.keys().next();
    if (!oldest.done) windows.delete(oldest.value);
  }
}

/** For tests: wait for every denial's audit row, then forget every window. */
export async function settleDenials(): Promise<void> {
  await Promise.all(pending);
  windows.clear();
}
