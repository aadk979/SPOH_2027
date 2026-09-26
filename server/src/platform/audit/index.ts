import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../db/client.js';

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
  | 'auth.stationScopeBypass';

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
}

/**
 * Write one audit row. Must be called with an open transaction client so it
 * shares the fate of the mutation.
 */
export async function writeAudit(tx: PrismaTransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      actorSub: entry.actorSub,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.before !== undefined ? { before: entry.before } : {}),
      ...(entry.after !== undefined ? { after: entry.after } : {}),
      ip: entry.ip,
      userAgent: entry.userAgent,
      requestId: entry.requestId,
    },
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
