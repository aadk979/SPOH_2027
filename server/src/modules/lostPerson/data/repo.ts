import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { membershipIdOf } from '../../../platform/db/membershipMirror.js';

/** Data access for lost-person alerts (PRODUCT_BRIEF §7.3). Every query names its event (ADR-001 §2). */

const alertInclude = {
  raisedBy: { select: { displayName: true, phone: true } },
  _count: { select: { acknowledgements: true } },
} satisfies Prisma.LostPersonAlertInclude;

export type AlertWithContext = Prisma.LostPersonAlertGetPayload<{ include: typeof alertInclude }>;

export async function createAlert(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.LostPersonAlertUncheckedCreateInput, 'eventId'>,
): Promise<AlertWithContext> {
  return tx.lostPersonAlert.create({
    data: {
      ...data,
      ...(await captureProvenance(tx, scope)),
      eventId: scope.eventId,
      raisedByMembershipId: await membershipIdOf(tx, scope, data.raisedById),
    },
    include: alertInclude,
  });
}

export async function findAlertById(
  scope: EventScope,
  id: string,
): Promise<AlertWithContext | null> {
  return prisma.lostPersonAlert.findUnique({
    where: { id, eventId: scope.eventId },
    include: alertInclude,
  });
}

export async function listActiveAlerts(scope: EventScope): Promise<AlertWithContext[]> {
  return prisma.lostPersonAlert.findMany({
    where: {
      eventId: scope.eventId,
      status: 'ACTIVE',
      // Real searches remain visible in every phase; practice interrupts only a rehearsal.
      // The relation predicate reads the phase in this query, avoiding a stale event cache.
      OR: [
        { rehearsal: false },
        { rehearsal: true, event: { id: scope.eventId, status: 'REHEARSAL' } },
      ],
    },
    include: alertInclude,
    orderBy: { raisedAt: 'asc' },
  });
}

/** A resolution's state check and write must not race another responder. */
export async function findAlertForUpdate(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
): Promise<AlertWithContext | null> {
  await tx.$queryRaw`SELECT id FROM "LostPersonAlert"
    WHERE "eventId" = ${scope.eventId} AND id = ${id} FOR UPDATE`;
  return tx.lostPersonAlert.findUnique({
    where: { eventId: scope.eventId, id },
    include: alertInclude,
  });
}

/** Which of these alerts has this volunteer already acknowledged. */
export async function acknowledgedAlertIds(
  scope: EventScope,
  viewer: { volunteerId: string; alertIds: string[] },
): Promise<Set<string>> {
  const { volunteerId, alertIds } = viewer;
  if (alertIds.length === 0) return new Set();

  const acks = await prisma.lostPersonAck.findMany({
    where: { eventId: scope.eventId, volunteerId, alertId: { in: alertIds } },
    select: { alertId: true },
  });

  return new Set(acks.map((ack) => ack.alertId));
}

/**
 * Acknowledge. Idempotent by unique constraint rather than by a read-then-write,
 * so two taps on a flaky connection cannot inflate the acknowledgement count
 * the Safety IC is reading to judge floor coverage.
 */
export async function acknowledgeAlert(
  tx: PrismaTransactionClient,
  scope: EventScope,
  ack: { alertId: string; volunteerId: string; rehearsal: boolean },
): Promise<boolean> {
  const membershipId = await membershipIdOf(tx, scope, ack.volunteerId);
  const { count } = await tx.lostPersonAck.createMany({
    data: [{ ...ack, eventId: scope.eventId, membershipId }],
    skipDuplicates: true,
  });
  return count === 1;
}

export async function resolveAlert(
  tx: PrismaTransactionClient,
  scope: EventScope,
  resolution: { id: string; outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER'; at: Date },
): Promise<void> {
  await tx.lostPersonAlert.update({
    where: { id: resolution.id, eventId: scope.eventId },
    data: { status: resolution.outcome, resolvedAt: resolution.at },
  });
}

/** Resolved, past the retention window, and not yet purged. */
export async function findPurgeCandidates(scope: EventScope, before: Date) {
  return prisma.lostPersonAlert.findMany({
    where: {
      eventId: scope.eventId,
      status: { not: 'ACTIVE' },
      resolvedAt: { lt: before },
      purgedAt: null,
    },
    include: alertInclude,
  });
}

/**
 * The description of a lost person, cleared once the case is resolved: the
 * schema's `visitor-transient` columns, exactly (ADR-002 §5).
 */
export const CLEARED_ON_PURGE = {
  approxAge: null,
  descriptionText: null,
  clothingText: null,
} as const;

export async function purgeAlert(
  tx: PrismaTransactionClient,
  scope: EventScope,
  alert: {
    id: string;
    raisedAt: Date;
    resolvedAt: Date;
    outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER';
    ackCount: number;
    resolutionMinutes: number;
    rehearsal: boolean;
  },
): Promise<boolean> {
  // Claim the alert first, conditionally: every worker runs the purge, and the
  // one whose update finds it unpurged does the work; the others get 0 rows and
  // stop, so each alert gets one summary (F03-031). The summary follows in the
  // same transaction, so the fields are never nulled without one.
  const { count } = await tx.lostPersonAlert.updateMany({
    where: { eventId: scope.eventId, id: alert.id, purgedAt: null },
    data: { ...CLEARED_ON_PURGE, purgedAt: new Date() },
  });
  if (count === 0) return false;

  await tx.lostPersonSummary.create({
    data: {
      eventId: scope.eventId,
      rehearsal: alert.rehearsal,
      raisedAt: alert.raisedAt,
      resolvedAt: alert.resolvedAt,
      resolutionMinutes: alert.resolutionMinutes,
      outcome: alert.outcome,
      ackCount: alert.ackCount,
    },
  });
  return true;
}

/**
 * A create response stored before replays were redacted still holds the
 * description (F04-013). Reduce it to the id the redacted replay reads.
 */
export async function scrubLegacyReplay(
  tx: PrismaTransactionClient,
  replay: { endpoint: string; alertId: string },
): Promise<void> {
  await tx.idempotencyRecord.updateMany({
    where: {
      endpoint: replay.endpoint,
      responseBody: { path: ['alert', 'id'], equals: replay.alertId },
    },
    data: { responseBody: { alertId: replay.alertId } },
  });
}
