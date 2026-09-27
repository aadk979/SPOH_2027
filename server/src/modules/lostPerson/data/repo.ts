import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

/** Data access for lost-person alerts (PRODUCT_BRIEF §7.3). */

const alertInclude = {
  raisedBy: { select: { displayName: true, phone: true } },
  _count: { select: { acknowledgements: true } },
} satisfies Prisma.LostPersonAlertInclude;

export type AlertWithContext = Prisma.LostPersonAlertGetPayload<{ include: typeof alertInclude }>;

export async function createAlert(
  tx: PrismaTransactionClient,
  data: Prisma.LostPersonAlertUncheckedCreateInput,
): Promise<AlertWithContext> {
  return tx.lostPersonAlert.create({ data, include: alertInclude });
}

export async function findAlertById(id: string): Promise<AlertWithContext | null> {
  return prisma.lostPersonAlert.findUnique({ where: { id }, include: alertInclude });
}

export async function listActiveAlerts(): Promise<AlertWithContext[]> {
  return prisma.lostPersonAlert.findMany({
    where: { status: 'ACTIVE' },
    include: alertInclude,
    orderBy: { raisedAt: 'asc' },
  });
}

/** Which of these alerts has this volunteer already acknowledged. */
export async function acknowledgedAlertIds(
  volunteerId: string,
  alertIds: string[],
): Promise<Set<string>> {
  if (alertIds.length === 0) return new Set();

  const acks = await prisma.lostPersonAck.findMany({
    where: { volunteerId, alertId: { in: alertIds } },
    select: { alertId: true },
  });

  return new Set(acks.map((ack) => ack.alertId));
}

/**
 * Acknowledge. Idempotent by unique constraint rather than by a read-then-write,
 * so two taps on a flaky connection cannot inflate the acknowledgement count
 * the Safety IC is reading to judge floor coverage.
 */
export async function acknowledgeAlert(alertId: string, volunteerId: string): Promise<void> {
  await prisma.lostPersonAck.upsert({
    where: { alertId_volunteerId: { alertId, volunteerId } },
    create: { alertId, volunteerId },
    update: {},
  });
}

export async function resolveAlert(
  tx: PrismaTransactionClient,
  resolution: { id: string; outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER'; at: Date },
): Promise<void> {
  await tx.lostPersonAlert.update({
    where: { id: resolution.id },
    data: { status: resolution.outcome, resolvedAt: resolution.at },
  });
}

/** Resolved, past the retention window, and not yet purged. */
export async function findPurgeCandidates(before: Date) {
  return prisma.lostPersonAlert.findMany({
    where: {
      status: { not: 'ACTIVE' },
      resolvedAt: { lt: before },
      purgedAt: null,
    },
    include: alertInclude,
  });
}

export async function purgeAlert(
  tx: PrismaTransactionClient,
  alert: {
    id: string;
    raisedAt: Date;
    resolvedAt: Date;
    outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER';
    ackCount: number;
    resolutionMinutes: number;
  },
): Promise<boolean> {
  // Claim the alert first, conditionally: every worker runs the purge, and the
  // one whose update finds it unpurged does the work; the others get 0 rows and
  // stop, so each alert gets one summary (F03-031). The summary follows in the
  // same transaction, so the fields are never nulled without one.
  const { count } = await tx.lostPersonAlert.updateMany({
    where: { id: alert.id, purgedAt: null },
    data: { approxAge: null, descriptionText: null, clothingText: null, purgedAt: new Date() },
  });
  if (count === 0) return false;

  await tx.lostPersonSummary.create({
    data: {
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
