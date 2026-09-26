import type { RegistrationRecord } from '@spoh/shared';
import type { Prisma, Registration } from '../../generated/prisma/client.js';
import { prisma } from '../../platform/db/client.js';
import type { PrismaTransactionClient } from '../../platform/db/client.js';

/**
 * Data access for COUNT 1 — registrations.
 *
 * Every read here filters `voided: false`. A voided row stays in the table for
 * the audit trail but must never appear in a count: correcting a mis-tap should
 * change the number, and deleting the evidence should not be how that happens
 * (PRODUCT_BRIEF §11.4).
 */

export function toRegistrationRecord(row: Registration): RegistrationRecord {
  return {
    id: row.id,
    category: row.category,
    stationId: row.stationId,
    groupId: row.groupId,
    missionCardId: row.missionCardId,
    source: row.source,
    recordedAt: row.recordedAt.toISOString(),
    clientRecordedAt: row.clientRecordedAt?.toISOString() ?? null,
    voided: row.voided,
  };
}

export async function createRegistration(
  tx: PrismaTransactionClient,
  data: Prisma.RegistrationUncheckedCreateInput,
): Promise<Registration> {
  return tx.registration.create({ data });
}

export async function createRegistrationsForGroup(
  tx: PrismaTransactionClient,
  rows: Prisma.RegistrationUncheckedCreateInput[],
): Promise<Registration[]> {
  // createManyAndReturn keeps this one round trip while still yielding the rows
  // the response needs; a family of four is four inserts either way.
  return tx.registration.createManyAndReturn({ data: rows });
}

export async function findRegistrationById(id: string): Promise<Registration | null> {
  return prisma.registration.findUnique({ where: { id } });
}

export async function voidRegistration(
  tx: PrismaTransactionClient,
  id: string,
  reason: string,
): Promise<Registration> {
  return tx.registration.update({
    where: { id },
    data: { voided: true, voidedReason: reason },
  });
}

/** Live count for one station today — the "booth total" on the capture screen. */
export async function countForStationSince(stationId: string, since: Date): Promise<number> {
  return prisma.registration.count({
    where: { stationId, voided: false, recordedAt: { gte: since } },
  });
}

/** This device's contribution, so two volunteers on one queue can see a drift. */
export async function countForRecorderSince(
  recordedById: string,
  stationId: string,
  since: Date,
): Promise<number> {
  return prisma.registration.count({
    where: { recordedById, stationId, voided: false, recordedAt: { gte: since } },
  });
}

export interface RegistrationSummaryFilter {
  stationId?: string;
  from?: Date;
  to?: Date;
}

function whereFrom(filter: RegistrationSummaryFilter): Prisma.RegistrationWhereInput {
  return {
    voided: false,
    ...(filter.stationId ? { stationId: filter.stationId } : {}),
    ...(filter.from || filter.to
      ? {
          recordedAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lt: filter.to } : {}),
          },
        }
      : {}),
  };
}

export async function groupByCategory(
  filter: RegistrationSummaryFilter,
): Promise<Array<{ category: string; count: number }>> {
  const rows = await prisma.registration.groupBy({
    by: ['category'],
    where: whereFrom(filter),
    _count: { _all: true },
  });

  return rows.map((row) => ({ category: row.category, count: row._count._all }));
}

/**
 * Time-bucketed counts. Raw SQL because `date_trunc` has no Prisma equivalent
 * and pulling every row into Node to bucket it would be worse at 30k rows.
 * Parameterised via a tagged template — never string interpolation
 * (BUILD_PLAN §8.3).
 */
export async function groupByTimeBucket(
  filter: RegistrationSummaryFilter,
  granularity: 'hour' | 'day',
): Promise<Array<{ bucket: Date; count: number }>> {
  const from = filter.from ?? new Date(0);
  const to = filter.to ?? new Date(8.64e15);
  const stationId = filter.stationId ?? null;

  const rows =
    granularity === 'hour'
      ? await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
          SELECT date_trunc('hour', "recordedAt") AS bucket, COUNT(*)::bigint AS count
          FROM "Registration"
          WHERE "voided" = false
            AND "recordedAt" >= ${from}
            AND "recordedAt" < ${to}
            AND (${stationId}::text IS NULL OR "stationId" = ${stationId})
          GROUP BY bucket
          ORDER BY bucket ASC`
      : await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
          SELECT date_trunc('day', "recordedAt") AS bucket, COUNT(*)::bigint AS count
          FROM "Registration"
          WHERE "voided" = false
            AND "recordedAt" >= ${from}
            AND "recordedAt" < ${to}
            AND (${stationId}::text IS NULL OR "stationId" = ${stationId})
          GROUP BY bucket
          ORDER BY bucket ASC`;

  return rows.map((row) => ({ bucket: row.bucket, count: Number(row.count) }));
}

export async function countMatching(filter: RegistrationSummaryFilter): Promise<number> {
  return prisma.registration.count({ where: whereFrom(filter) });
}
