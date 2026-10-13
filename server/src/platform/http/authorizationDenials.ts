import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { writeAudit } from '../audit/index.js';
import { prisma } from '../db/client.js';
import { logger } from '../logger/index.js';
import { auditContextFrom } from './auditContext.js';
import { incrementCounter, type CounterSpec } from './quotaCounterRepo.js';
import { counterNumber, quotaDigest } from './quotaKeys.js';
import { systemClock } from '../time/index.js';

/**
 * Denials in the security audit (P11.5): who was refused what, and which policies decided it.
 *
 * A screen that polls a route its reader may not use is refused every few seconds, and a
 * row each time would make the audit table the incident. Identical denials (one caller,
 * one route) within a minute collapse into one row; the next window's row says how many it
 * stood for. PostgreSQL coordinates every app instance and keeps events separate.
 *
 * Fire-and-forget: nothing changed, so there is no transaction to join, and a failing
 * database must not turn a 403 into a 500. Every denial is also logged.
 */

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
  const audit = auditContextFrom(req);
  const spec: CounterSpec = { namespace: 'authorization.denial',
    scopeDigest: quotaDigest([audit.eventId ?? 'platform', denial.route]),
    subjectDigest: quotaDigest(audit.actorSub ? `sub:${audit.actorSub}` : `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`),
    windowSeconds: 60 };
  const now = systemClock.now();
  const method = req.method;
  const write = prisma.$transaction(async (tx) => {
    const claim = await incrementCounter(tx, spec, now);
    if (!claim.opened) return;
    const suppressed = counterNumber(claim.previousWindowHits > 0n ? claim.previousWindowHits - 1n : 0n);
    await writeAudit(tx, { ...audit, action: 'authorization.denied', severity: 'WARNING',
      outcome: 'DENIED', entityType: 'Route', entityId: denial.route,
      after: { actions: [...denial.actions], policies: [...denial.policies],
        ...(suppressed > 0 ? { previousWindowSuppressed: suppressed } : {}) },
      method, path: denial.path, statusCode: 403 });
  })
    .catch((error: unknown) => {
      logger.error({ err: error, route: denial.route }, 'failed to record an authorization denial');
    })
    .finally(() => pending.delete(write));
  pending.add(write);
}

/** Drain pending writes; callers reset the shared counter table explicitly. */
export async function settleDenials(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
