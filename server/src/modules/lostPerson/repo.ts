import type { LostPersonAlertRecord } from '@spoh/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../lib/prisma.js';

/** Data access for lost-person alerts (PRODUCT_BRIEF §7.3). */

const alertInclude = {
  raisedBy: { select: { displayName: true, phone: true } },
  _count: { select: { acknowledgements: true } },
} satisfies Prisma.LostPersonAlertInclude;

export type AlertWithContext = Prisma.LostPersonAlertGetPayload<{ include: typeof alertInclude }>;

export function toAlertRecord(
  alert: AlertWithContext,
  context: { stationName: string | null; ackedByMe: boolean },
): LostPersonAlertRecord {
  return {
    id: alert.id,
    status: alert.status,
    approxAge: alert.approxAge,
    descriptionText: alert.descriptionText,
    clothingText: alert.clothingText,
    lastSeenStationId: alert.lastSeenStationId,
    lastSeenStationName: context.stationName,
    lastSeenAt: alert.lastSeenAt?.toISOString() ?? null,
    raisedById: alert.raisedById,
    raisedByName: alert.raisedBy.displayName,
    // The reporter's number travels with the alert on purpose: the standing
    // instruction is that calling beats tapping, and a searcher who finds the
    // child needs to reach the person who raised it without leaving the screen.
    raisedByPhone: alert.raisedBy.phone,
    raisedAt: alert.raisedAt.toISOString(),
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    ackCount: alert._count.acknowledgements,
    ackedByMe: context.ackedByMe,
  };
}

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
  id: string,
  outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER',
  at: Date,
): Promise<void> {
  await tx.lostPersonAlert.update({
    where: { id },
    data: { status: outcome, resolvedAt: at },
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
): Promise<void> {
  // The anonymised summary is created first, so the descriptive fields are
  // never nulled without a replacement record existing in the same transaction.
  await tx.lostPersonSummary.create({
    data: {
      raisedAt: alert.raisedAt,
      resolvedAt: alert.resolvedAt,
      resolutionMinutes: alert.resolutionMinutes,
      outcome: alert.outcome,
      ackCount: alert.ackCount,
    },
  });

  await tx.lostPersonAlert.update({
    where: { id: alert.id },
    data: {
      approxAge: null,
      descriptionText: null,
      clothingText: null,
      purgedAt: new Date(),
    },
  });
}
