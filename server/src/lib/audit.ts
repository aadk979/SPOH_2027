import type { AuditOutcome, AuditSeverity } from '@spoh/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { shipAuditEvent } from './cloudwatch.js';
import { prisma, type PrismaTransactionClient } from './prisma.js';

/**
 * Audit logging (BUILD_PLAN §8.7).
 *
 * The rule that matters: an audit write happens inside the same transaction as
 * the mutation it describes, so if the audit write fails the mutation fails
 * too. A corrective action that left no trace would be worse than one that
 * never happened — the post-event reconciliation depends on this log being
 * complete rather than merely usually complete.
 *
 * Callers therefore pass the transaction client, never the root client.
 *
 * ── Security events ─────────────────────────────────────────────────────────
 *
 * A refused sign-in, a denied capability and a rate-limit trip change nothing,
 * so they have no transaction to ride along with. `recordSecurityEvent` writes
 * those on their own, outside any transaction and without awaiting — a failure
 * to log a rejected request must never turn into a failed response, and the
 * request it describes has already been refused anyway.
 *
 * ── CloudWatch ──────────────────────────────────────────────────────────────
 *
 * Every row is also shipped to a log group, because Postgres and the audit
 * trail live on the same box: whatever kills one takes the other with it, at
 * exactly the moment somebody needs to read it. Shipping is buffered and never
 * throws, so it cannot affect the transaction that produced the row.
 */

/** Every auditable action. String union rather than an enum so it reads in logs. */
export type AuditAction =
  | 'attendance.present'
  | 'attendance.challenge'
  | 'registration.create'
  | 'registration.createGroup'
  | 'registration.void'
  | 'footfall.tick'
  | 'footfall.bulk'
  | 'footfall.void'
  | 'card.issue'
  | 'card.stamp'
  | 'card.void'
  | 'card.reissue'
  | 'gift.redeem'
  | 'gift.adjust'
  | 'incident.create'
  | 'incident.statusChange'
  | 'incident.followUp'
  | 'lostPerson.raise'
  | 'lostPerson.resolve'
  | 'lostPerson.purge'
  | 'lostFound.create'
  | 'lostFound.claim'
  | 'roster.edit'
  | 'roster.import'
  | 'shift.checkIn'
  | 'shift.checkOut'
  | 'swap.decide'
  | 'announcement.send'
  | 'fallback.declare'
  | 'fallback.close'
  | 'import.run'
  | 'user.provision'
  | 'user.update'
  | 'user.deactivate'
  | 'user.reactivate'
  | 'user.resendInvite'
  | 'assignment.create'
  | 'assignment.delete'
  | 'station.create'
  | 'station.update'
  | 'eventDay.create'
  | 'eventDay.update'
  | 'giftType.create'
  | 'giftType.update'
  | 'settings.update'
  | 'session.create'
  | 'session.revoke'
  | 'session.reuseDetected'
  | 'notification.dispatch'
  | 'media.upload'
  | 'auth.stationScopeBypass'
  // ── Security events. No mutation behind them; see recordSecurityEvent. ────
  /** A token that did not verify, or a session that no longer exists. */
  | 'auth.denied'
  /** Verified identity, but no active roster row — a withdrawn volunteer. */
  | 'auth.noRosterRow'
  /** Authenticated, but the role lacks the capability the route requires. */
  | 'rbac.denied'
  /** A capture write aimed at a station the caller is not rostered on. */
  | 'rbac.stationScopeDenied'
  /** Rate limiter tripped. Bursty and usually innocent; repeated is not. */
  | 'rateLimit.exceeded'
  /** A state-changing auth request from an origin we do not serve. */
  | 'auth.untrustedOrigin'
  /** An unhandled 5xx. Recorded so the log explains its own gaps. */
  | 'system.error';

export interface AuditContext {
  /** `Volunteer.id`. Null only for system-initiated actions such as the purge job. */
  actorId: string | null;
  /** Identity-provider subject, kept even if the volunteer row is later removed. */
  actorSub: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface AuditEntry extends AuditContext {
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  /** State before the change. Omit for creates. */
  before?: Prisma.InputJsonValue;
  /** State after the change. Omit for deletes. */
  after?: Prisma.InputJsonValue;
  /** Overrides the default grading for this action. */
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
}

/**
 * Default severity per action.
 *
 * Only the exceptions are listed; anything absent is `INFO`. The grading is
 * what makes the admin screen's "show me only what matters" filter mean
 * something, so it is set here once rather than at each of the ~50 call sites.
 */
const SEVERITY: Partial<Record<AuditAction, AuditSeverity>> = {
  // Corrective actions. Legitimate, but somebody may have to explain them.
  'registration.void': 'NOTICE',
  'footfall.void': 'NOTICE',
  'card.void': 'NOTICE',
  'card.reissue': 'NOTICE',
  'gift.adjust': 'NOTICE',
  'lostPerson.purge': 'NOTICE',
  'roster.import': 'NOTICE',
  'import.run': 'NOTICE',
  'settings.update': 'NOTICE',
  'session.revoke': 'NOTICE',
  // Anything that changes who can do what.
  'user.provision': 'NOTICE',
  'user.update': 'NOTICE',
  'user.deactivate': 'NOTICE',
  'user.reactivate': 'NOTICE',
  'user.resendInvite': 'NOTICE',
  // Event-wide declarations.
  'fallback.declare': 'WARNING',
  'fallback.close': 'NOTICE',
  // Refusals.
  'auth.denied': 'WARNING',
  'auth.noRosterRow': 'WARNING',
  'rbac.denied': 'WARNING',
  'rbac.stationScopeDenied': 'WARNING',
  'rateLimit.exceeded': 'NOTICE',
  'auth.untrustedOrigin': 'CRITICAL',
  'auth.stationScopeBypass': 'WARNING',
  // A replayed refresh token means a stolen one, until proven otherwise.
  'session.reuseDetected': 'CRITICAL',
  'system.error': 'WARNING',
};

const OUTCOME: Partial<Record<AuditAction, AuditOutcome>> = {
  'auth.denied': 'DENIED',
  'auth.noRosterRow': 'DENIED',
  'rbac.denied': 'DENIED',
  'rbac.stationScopeDenied': 'DENIED',
  'rateLimit.exceeded': 'DENIED',
  'auth.untrustedOrigin': 'DENIED',
  'session.reuseDetected': 'FAILURE',
  'system.error': 'FAILURE',
};

export function severityOf(action: AuditAction): AuditSeverity {
  return SEVERITY[action] ?? 'INFO';
}

export function outcomeOf(action: AuditAction): AuditOutcome {
  return OUTCOME[action] ?? 'SUCCESS';
}

/** The row shape both writers build, so the two paths cannot drift apart. */
function rowFor(
  entry: AuditEntry & { method?: string | null; path?: string | null; statusCode?: number | null },
) {
  return {
    actorId: entry.actorId,
    actorSub: entry.actorSub,
    action: entry.action,
    severity: entry.severity ?? severityOf(entry.action),
    outcome: entry.outcome ?? outcomeOf(entry.action),
    entityType: entry.entityType,
    entityId: entry.entityId,
    ...(entry.before !== undefined ? { before: entry.before } : {}),
    ...(entry.after !== undefined ? { after: entry.after } : {}),
    method: entry.method ?? null,
    path: entry.path ?? null,
    statusCode: entry.statusCode ?? null,
    ip: entry.ip,
    userAgent: entry.userAgent,
    requestId: entry.requestId,
  };
}

/**
 * Write one audit row. Must be called with an open transaction client so it
 * shares the fate of the mutation.
 */
export async function writeAudit(tx: PrismaTransactionClient, entry: AuditEntry): Promise<void> {
  const created = await tx.auditLog.create({ data: rowFor(entry) });

  // Outside the transaction's success or failure by design: if the transaction
  // rolls back, CloudWatch holds a record of an attempt that did not land,
  // which is the safer of the two ways to be wrong.
  shipAuditEvent({ ...created, createdAt: created.createdAt.toISOString() });
}

/**
 * Record something that was refused.
 *
 * Fire-and-forget on purpose. There is no transaction to join — nothing
 * changed — and the response has already been decided, so awaiting the write
 * would add latency to the error path and give a failing database a second way
 * to turn a 403 into a 500.
 */
export function recordSecurityEvent(
  entry: AuditEntry & { method?: string | null; path?: string | null; statusCode?: number | null },
): void {
  const data = rowFor(entry);

  void prisma.auditLog
    .create({ data })
    .then((created) => shipAuditEvent({ ...created, createdAt: created.createdAt.toISOString() }))
    .catch(() => {
      // The database is the thing that is failing. Ship what we have anyway —
      // a CloudWatch record of a refused request is worth more than a clean
      // stack trace, and there is nowhere above here to report this to.
      shipAuditEvent({ ...data, createdAt: new Date().toISOString(), persisted: false });
    });
}

/**
 * An IC-or-above who wrote to a station they are not rostered on. The write is
 * legitimate — ICs are the people who fix a station that has gone wrong — but
 * it must be distinguishable from a normal capture during reconciliation, so
 * it is recorded inside the same transaction as the write it accompanies
 * (BUILD_PLAN §6.3).
 *
 * A no-op when no bypass occurred, so every capture service can call it
 * unconditionally.
 */
export async function auditStationScopeBypass(
  tx: PrismaTransactionClient,
  bypass: { stationId: string } | undefined,
  context: AuditContext,
): Promise<void> {
  if (!bypass) return;

  await writeAudit(tx, {
    ...context,
    action: 'auth.stationScopeBypass',
    entityType: 'Station',
    entityId: bypass.stationId,
    after: { stationId: bypass.stationId },
  });
}
