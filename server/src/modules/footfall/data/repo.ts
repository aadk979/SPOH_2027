import {
  captureProvenance,
  type CaptureModeScope,
} from '../../../platform/db/captureProvenance.js';
import type { FootfallTick, Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { rehearsalFilter, type ReportingScope } from '../../../platform/db/rehearsalFilter.js';
import { localBucketStartSql } from '../../../platform/db/zonedSql.js';

/**
 * Data access for COUNT 2 — footfall. Every query names its event (ADR-001 §2).
 *
 * Every aggregate sums `quantity` rather than counting rows: an app tap is
 * quantity 1, but a clicker total keyed in by an IC at end of shift is one row
 * with quantity 240. Counting rows would silently discard the fallback data.
 */

export async function createTick(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: Omit<Prisma.FootfallTickUncheckedCreateInput, 'eventId'>,
): Promise<FootfallTick> {
  return tx.footfallTick.create({
    data: { ...data, eventId: scope.eventId, ...(await captureProvenance(tx, scope)) },
  });
}

export async function findTickById(scope: EventScope, id: string): Promise<FootfallTick | null> {
  return prisma.footfallTick.findFirst({ where: { eventId: scope.eventId, id } });
}

export async function voidTick(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
): Promise<FootfallTick> {
  return tx.footfallTick.update({ where: { id, eventId: scope.eventId }, data: { voided: true } });
}

async function sumQuantity(where: Prisma.FootfallTickWhereInput & EventScope): Promise<number> {
  const result = await prisma.footfallTick.aggregate({ where, _sum: { quantity: true } });
  return result._sum.quantity ?? 0;
}

export async function sumForStationSince(
  scope: CaptureModeScope,
  stationId: string,
  since: Date,
): Promise<number> {
  return sumQuantity({
    eventId: scope.eventId,
    rehearsal: scope.rehearsal,
    stationId,
    voided: false,
    recordedAt: { gte: since },
  });
}

export async function sumForRecorderSince(
  scope: CaptureModeScope,
  recorder: { recordedById: string; stationId: string },
  since: Date,
): Promise<number> {
  return sumQuantity({
    eventId: scope.eventId,
    rehearsal: scope.rehearsal,
    ...recorder,
    voided: false,
    recordedAt: { gte: since },
  });
}

export interface FootfallFilter {
  stationId?: string;
  from?: Date;
  to?: Date;
}

function whereFrom(
  scope: ReportingScope,
  filter: FootfallFilter,
): Prisma.FootfallTickWhereInput & EventScope {
  return {
    eventId: scope.eventId,
    ...rehearsalFilter(scope),
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

export async function sumMatching(scope: ReportingScope, filter: FootfallFilter): Promise<number> {
  return sumQuantity(whereFrom(scope, filter));
}

/**
 * Bucketed curves per station — the thing last year's "Room 3: 120" WhatsApp
 * message could never give you.
 *
 * Raw SQL because Postgres can bucket by an arbitrary interval and Prisma
 * cannot. Buckets align to the event's wall clock (a 30-minute bucket at
 * +05:45 starts on the local half hour). Parameterised through a tagged
 * template; the minutes are validated upstream against a fixed set (15, 30,
 * 60), never free text.
 */
export async function sumByBucket(
  scope: ReportingScope,
  filter: FootfallFilter,
  bucket: { minutes: number; timezone: string },
): Promise<Array<{ stationId: string; bucket: Date; total: number }>> {
  const from = filter.from ?? new Date(0);
  const to = filter.to ?? new Date(8.64e15);
  const stationId = filter.stationId ?? null;

  const rows = await prisma.$queryRaw<Array<{ stationId: string; bucket: Date; total: bigint }>>`
    SELECT
      "stationId",
      ${localBucketStartSql('recordedAt', bucket.timezone, bucket.minutes)} AS bucket,
      SUM("quantity")::bigint AS total
    FROM "FootfallTick"
    WHERE "eventId" = ${scope.eventId}
      AND (${scope.includeRehearsal ?? false} OR "rehearsal" = false)
      AND "voided" = false
      AND "recordedAt" >= ${from}
      AND "recordedAt" < ${to}
      AND (${stationId}::text IS NULL OR "stationId" = ${stationId})
    GROUP BY "stationId", bucket
    ORDER BY "stationId" ASC, bucket ASC`;

  return rows.map((row) => ({
    stationId: row.stationId,
    bucket: row.bucket,
    total: Number(row.total),
  }));
}

/**
 * Per-station totals plus last activity, for the live view and the data-health
 * panel. `lastActivityAt` is the signal that matters: a station that has quietly
 * stopped counting is invisible in a total and obvious here.
 */
export async function liveStationStats(
  scope: ReportingScope,
  window: { since: Date; until: Date },
): Promise<
  Array<{ stationId: string; total: number; lastActivityAt: Date | null; counters: number }>
> {
  const rows = await prisma.$queryRaw<
    Array<{ stationId: string; total: bigint; lastActivityAt: Date | null; counters: bigint }>
  >`
    SELECT
      "stationId",
      COALESCE(SUM("quantity"), 0)::bigint          AS total,
      MAX("recordedAt")                              AS "lastActivityAt",
      COUNT(DISTINCT "recordedById")::bigint         AS counters
    FROM "FootfallTick"
    WHERE "eventId" = ${scope.eventId}
      AND (${scope.includeRehearsal ?? false} OR "rehearsal" = false)
      AND "voided" = false AND "recordedAt" >= ${window.since} AND "recordedAt" <= ${window.until}
    GROUP BY "stationId"`;

  return rows.map((row) => ({
    stationId: row.stationId,
    total: Number(row.total),
    lastActivityAt: row.lastActivityAt,
    counters: Number(row.counters),
  }));
}
