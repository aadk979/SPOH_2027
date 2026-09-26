import type { FootfallTickRecord } from '@spoh/shared';
import type { FootfallTick, Prisma } from '../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../platform/db/client.js';

/**
 * Data access for COUNT 2 — footfall.
 *
 * Every aggregate sums `quantity` rather than counting rows: an app tap is
 * quantity 1, but a clicker total keyed in by an IC at end of shift is one row
 * with quantity 240. Counting rows would silently discard the fallback data.
 */

export function toFootfallTickRecord(row: FootfallTick): FootfallTickRecord {
  return {
    id: row.id,
    stationId: row.stationId,
    quantity: row.quantity,
    source: row.source,
    recordedAt: row.recordedAt.toISOString(),
    clientRecordedAt: row.clientRecordedAt?.toISOString() ?? null,
    timeBlockStart: row.timeBlockStart?.toISOString() ?? null,
    voided: row.voided,
  };
}

export async function createTick(
  tx: PrismaTransactionClient,
  data: Prisma.FootfallTickUncheckedCreateInput,
): Promise<FootfallTick> {
  return tx.footfallTick.create({ data });
}

export async function findTickById(id: string): Promise<FootfallTick | null> {
  return prisma.footfallTick.findUnique({ where: { id } });
}

export async function voidTick(tx: PrismaTransactionClient, id: string): Promise<FootfallTick> {
  return tx.footfallTick.update({ where: { id }, data: { voided: true } });
}

async function sumQuantity(where: Prisma.FootfallTickWhereInput): Promise<number> {
  const result = await prisma.footfallTick.aggregate({ where, _sum: { quantity: true } });
  return result._sum.quantity ?? 0;
}

export async function sumForStationSince(stationId: string, since: Date): Promise<number> {
  return sumQuantity({ stationId, voided: false, recordedAt: { gte: since } });
}

export async function sumForRecorderSince(
  recordedById: string,
  stationId: string,
  since: Date,
): Promise<number> {
  return sumQuantity({ recordedById, stationId, voided: false, recordedAt: { gte: since } });
}

export interface FootfallFilter {
  stationId?: string;
  from?: Date;
  to?: Date;
}

function whereFrom(filter: FootfallFilter): Prisma.FootfallTickWhereInput {
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

export async function sumMatching(filter: FootfallFilter): Promise<number> {
  return sumQuantity(whereFrom(filter));
}

/**
 * Bucketed curves per station — the thing last year's "DCS: 120" WhatsApp
 * message could never give you.
 *
 * Raw SQL because Postgres can bucket by an arbitrary interval and Prisma
 * cannot. Parameterised through a tagged template; `bucketMinutes` is a number
 * validated upstream against a fixed set (15, 30, 60), never free text.
 */
export async function sumByBucket(
  filter: FootfallFilter,
  bucketMinutes: number,
): Promise<Array<{ stationId: string; bucket: Date; total: number }>> {
  const from = filter.from ?? new Date(0);
  const to = filter.to ?? new Date(8.64e15);
  const stationId = filter.stationId ?? null;
  const intervalSeconds = bucketMinutes * 60;

  const rows = await prisma.$queryRaw<Array<{ stationId: string; bucket: Date; total: bigint }>>`
    SELECT
      "stationId",
      to_timestamp(floor(extract(epoch FROM "recordedAt") / ${intervalSeconds}) * ${intervalSeconds}) AS bucket,
      SUM("quantity")::bigint AS total
    FROM "FootfallTick"
    WHERE "voided" = false
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
  since: Date,
  until: Date,
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
    WHERE "voided" = false AND "recordedAt" >= ${since} AND "recordedAt" <= ${until}
    GROUP BY "stationId"`;

  return rows.map((row) => ({
    stationId: row.stationId,
    total: Number(row.total),
    lastActivityAt: row.lastActivityAt,
    counters: Number(row.counters),
  }));
}
