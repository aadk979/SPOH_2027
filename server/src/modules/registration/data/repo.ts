import type { Prisma, Registration } from '../../../generated/prisma/client.js';
import { prisma } from '../../../platform/db/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Data access for COUNT 1 — registrations.
 *
 * Every query names its event (ADR-001 §2). Every read here filters
 * `voided: false`. A voided row stays in the table for the audit trail but
 * must never appear in a count: correcting a mis-tap should change the number,
 * and deleting the evidence should not be how that happens (PRODUCT_BRIEF §11.4).
 */

/** A registration as the capture writes it; the event is the scope's. */
export type NewRegistration = Omit<
  Prisma.RegistrationUncheckedCreateInput,
  'eventId' | 'categoryId'
>;

/**
 * The event's category for a capture's code. Expand phase: the capture still
 * names the category by its code, and both columns are written (P09.5).
 */
export async function categoryIdFor(
  tx: PrismaTransactionClient,
  scope: EventScope,
  code: string,
): Promise<string | null> {
  const category = await tx.captureCategory.findUnique({
    where: { eventId_code: { eventId: scope.eventId, code } },
    select: { id: true },
  });
  return category?.id ?? null;
}

export async function createRegistration(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: NewRegistration,
): Promise<Registration> {
  const categoryId = await categoryIdFor(tx, scope, data.category);
  return tx.registration.create({ data: { ...data, eventId: scope.eventId, categoryId } });
}

export async function createRegistrationsForGroup(
  tx: PrismaTransactionClient,
  scope: EventScope,
  rows: NewRegistration[],
): Promise<Registration[]> {
  const codes = [...new Set(rows.map((row) => row.category))];
  // Sequential: parallel queries overlap on a transaction's connection (F03-019).
  const ids = new Map<string, string | null>();
  for (const code of codes) ids.set(code, await categoryIdFor(tx, scope, code));
  // createManyAndReturn keeps this one round trip while still yielding the rows
  // the response needs; a family of four is four inserts either way.
  return tx.registration.createManyAndReturn({
    data: rows.map((row) => ({
      ...row,
      eventId: scope.eventId,
      categoryId: ids.get(row.category) ?? null,
    })),
  });
}

export async function findRegistrationById(
  scope: EventScope,
  id: string,
): Promise<Registration | null> {
  return prisma.registration.findFirst({ where: { eventId: scope.eventId, id } });
}

export async function voidRegistration(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: { id: string; reason: string },
): Promise<Registration> {
  return tx.registration.update({
    where: { id: change.id, eventId: scope.eventId },
    data: { voided: true, voidedReason: change.reason },
  });
}

/** Live count for one station today — the "booth total" on the capture screen. */
export async function countForStationSince(
  scope: EventScope,
  stationId: string,
  since: Date,
): Promise<number> {
  return prisma.registration.count({
    where: { eventId: scope.eventId, stationId, voided: false, recordedAt: { gte: since } },
  });
}

/** This device's contribution, so two volunteers on one queue can see a drift. */
export async function countForRecorderSince(
  scope: EventScope,
  recorder: { recordedById: string; stationId: string },
  since: Date,
): Promise<number> {
  return prisma.registration.count({
    where: { eventId: scope.eventId, ...recorder, voided: false, recordedAt: { gte: since } },
  });
}

export interface RegistrationSummaryFilter {
  stationId?: string;
  from?: Date;
  to?: Date;
}

function whereFrom(
  scope: EventScope,
  filter: RegistrationSummaryFilter,
): Prisma.RegistrationWhereInput {
  return {
    eventId: scope.eventId,
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

/** Counts per category, read through the event's categories (P09.5). */
export async function groupByCategory(
  scope: EventScope,
  filter: RegistrationSummaryFilter,
): Promise<Array<{ category: string; label: string; count: number }>> {
  const [rows, categories] = await Promise.all([
    prisma.registration.groupBy({
      by: ['categoryId'],
      where: whereFrom(scope, filter),
      _count: { _all: true },
    }),
    prisma.captureCategory.findMany({
      where: { eventId: scope.eventId },
      select: { id: true, code: true, label: true },
    }),
  ]);
  const byId = new Map(categories.map((category) => [category.id, category]));
  return rows.flatMap((row) => {
    const category = row.categoryId ? byId.get(row.categoryId) : undefined;
    return category
      ? [{ category: category.code, label: category.label, count: row._count._all }]
      : [];
  });
}

/**
 * Time-bucketed counts. Raw SQL because `date_trunc` has no Prisma equivalent
 * and pulling every row into Node to bucket it would be worse at 30k rows.
 * Parameterised via a tagged template — never string interpolation
 * (BUILD_PLAN §8.3).
 */
export async function groupByTimeBucket(
  scope: EventScope,
  filter: RegistrationSummaryFilter,
  granularity: 'hour' | 'day',
): Promise<Array<{ bucket: Date; count: number }>> {
  const from = filter.from ?? new Date(0);
  const to = filter.to ?? new Date(8.64e15);
  const stationId = filter.stationId ?? null;
  const { eventId } = scope;

  const rows =
    granularity === 'hour'
      ? await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
          SELECT date_trunc('hour', "recordedAt") AS bucket, COUNT(*)::bigint AS count
          FROM "Registration"
          WHERE "eventId" = ${eventId}
            AND "voided" = false
            AND "recordedAt" >= ${from}
            AND "recordedAt" < ${to}
            AND (${stationId}::text IS NULL OR "stationId" = ${stationId})
          GROUP BY bucket
          ORDER BY bucket ASC`
      : await prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
          SELECT date_trunc('day', "recordedAt") AS bucket, COUNT(*)::bigint AS count
          FROM "Registration"
          WHERE "eventId" = ${eventId}
            AND "voided" = false
            AND "recordedAt" >= ${from}
            AND "recordedAt" < ${to}
            AND (${stationId}::text IS NULL OR "stationId" = ${stationId})
          GROUP BY bucket
          ORDER BY bucket ASC`;

  return rows.map((row) => ({ bucket: row.bucket, count: Number(row.count) }));
}

export async function countMatching(
  scope: EventScope,
  filter: RegistrationSummaryFilter,
): Promise<number> {
  return prisma.registration.count({ where: whereFrom(scope, filter) });
}
