import {
  ERROR_CODES,
  type CreateFootfallBulkRequest,
  type CreateFootfallTickRequest,
  type CreateFootfallTickResponse,
  type FootfallLiveResponse,
  type FootfallSummaryQuery,
  type FootfallSummaryResponse,
} from '@spoh/shared';
import { auditStationScopeBypass, writeAudit, type AuditContext } from '../../lib/audit.js';
import type { CaptureActor } from '../../lib/captureActor.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import {
  BUCKET_MINUTES,
  eventDayAnchor,
  minutesBetween,
  singaporeDateString,
} from '../../lib/time.js';
import { rangeOverlapsFallbackWindow } from '../fallback/repo.js';
import { listCountedStations } from '../station/repo.js';
import { requireCountedStation } from '../station/service.js';
import {
  createTick,
  findTickById,
  liveStationStats,
  sumByBucket,
  sumForRecorderSince,
  sumForStationSince,
  sumMatching,
  toFootfallTickRecord,
  voidTick,
  type FootfallFilter,
} from './repo.js';

/**
 * COUNT 2 — footfall (PRODUCT_BRIEF §3).
 *
 * Increment-only with undo. There is deliberately no endpoint that edits a
 * tick's time or quantity after the fact: editable history is how tallies get
 * "tidied up" into fiction. A wrong tick is voided, and the void is visible.
 */

/** A station silent for longer than this during event hours is flagged. */
export const SILENT_STATION_MINUTES = 15;

function startOfEventDay(now = new Date()): Date {
  return eventDayAnchor(singaporeDateString(now));
}

export async function recordTick(
  request: CreateFootfallTickRequest,
  actor: CaptureActor,
  audit: AuditContext,
): Promise<CreateFootfallTickResponse> {
  const station = await requireCountedStation(request.stationId);
  const clientRecordedAt = request.clientRecordedAt ? new Date(request.clientRecordedAt) : null;
  // Server-stamped on receipt (BUILD_PLAN §3.3); the client's own timestamp is
  // kept alongside so a sleeping phone is visible rather than silently absent.
  const recordedAt = new Date();

  const tick = await prisma.$transaction(async (tx) => {
    const row = await createTick(tx, {
      stationId: station.id,
      recordedById: actor.volunteerId,
      quantity: 1,
      source: 'APP',
      recordedAt,
      clientRecordedAt,
      idempotencyKey: request.idempotencyKey,
    });

    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);

    await writeAudit(tx, {
      ...audit,
      action: 'footfall.tick',
      entityType: 'FootfallTick',
      entityId: row.id,
      after: { stationId: row.stationId, quantity: row.quantity },
    });

    return row;
  });

  const since = startOfEventDay();

  return {
    tick: toFootfallTickRecord(tick),
    sessionTotal: await sumForRecorderSince(actor.volunteerId, station.id, since),
    stationTotal: await sumForStationSince(station.id, since),
  };
}

/**
 * IC bulk entry: a physical clicker total at end of shift, or a 30-minute block
 * transcribed off a fallback sheet. Always source-tagged, and `timeBlockStart`
 * records that only the block is known — so a report can state plainly that
 * this hour came from manual counts (PRODUCT_BRIEF §11.4).
 */
export async function recordBulk(
  request: CreateFootfallBulkRequest,
  actor: CaptureActor,
  audit: AuditContext,
): Promise<CreateFootfallTickResponse> {
  const station = await requireCountedStation(request.stationId);
  const timeBlockStart = new Date(request.timeBlockStart);

  const tick = await prisma.$transaction(async (tx) => {
    const row = await createTick(tx, {
      stationId: station.id,
      recordedById: actor.volunteerId,
      quantity: request.quantity,
      source: request.source,
      timeBlockStart,
      // A block total belongs at the start of its block, not at the moment the
      // IC happened to type it in — otherwise the curve grows a spike at 18:00.
      recordedAt: timeBlockStart,
      idempotencyKey: request.idempotencyKey,
    });

    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);

    await writeAudit(tx, {
      ...audit,
      action: 'footfall.bulk',
      entityType: 'FootfallTick',
      entityId: row.id,
      after: {
        stationId: row.stationId,
        quantity: row.quantity,
        source: row.source,
        timeBlockStart: timeBlockStart.toISOString(),
        reason: request.reason,
      },
    });

    return row;
  });

  const since = startOfEventDay();

  return {
    tick: toFootfallTickRecord(tick),
    sessionTotal: await sumForRecorderSince(actor.volunteerId, station.id, since),
    stationTotal: await sumForStationSince(station.id, since),
  };
}

export async function voidTickById(id: string, reason: string, audit: AuditContext): Promise<void> {
  const existing = await findTickById(id);
  if (!existing) throw new NotFoundError('Footfall tick');

  if (existing.voided) {
    throw new AppError(409, ERROR_CODES.ALREADY_VOIDED, 'This tick is already voided');
  }

  await prisma.$transaction(async (tx) => {
    await voidTick(tx, id);

    await writeAudit(tx, {
      ...audit,
      action: 'footfall.void',
      entityType: 'FootfallTick',
      entityId: id,
      before: { voided: false, quantity: existing.quantity, stationId: existing.stationId },
      after: { voided: true, reason },
    });
  });
}

export async function summariseFootfall(
  query: FootfallSummaryQuery,
): Promise<FootfallSummaryResponse> {
  const filter: FootfallFilter = {
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
  };

  const [total, containsFallbackData, stations, rows] = await Promise.all([
    sumMatching(filter),
    rangeOverlapsFallbackWindow(filter),
    listCountedStations(),
    sumByBucket(filter, BUCKET_MINUTES[query.bucket]),
  ]);

  const byStation = new Map<string, Array<{ bucketStart: string; value: number }>>();
  for (const row of rows) {
    const list = byStation.get(row.stationId) ?? [];
    list.push({ bucketStart: row.bucket.toISOString(), value: row.total });
    byStation.set(row.stationId, list);
  }

  const included = query.stationId
    ? stations.filter((station) => station.id === query.stationId)
    : stations;

  return {
    unit: 'roomEntries',
    bucket: query.bucket,
    total,
    stations: included.map((station) => {
      const buckets = byStation.get(station.id) ?? [];
      return {
        stationId: station.id,
        stationName: station.name,
        total: buckets.reduce((sum, bucket) => sum + bucket.value, 0),
        buckets,
      };
    }),
    containsFallbackData,
  };
}

/**
 * Live counts with a silence flag per station. Every counted room appears, even
 * one with no ticks at all — a station missing from the list would be a station
 * nobody notices has stopped (PRODUCT_BRIEF §9).
 */
export async function getLiveFootfall(now = new Date()): Promise<FootfallLiveResponse> {
  const since = startOfEventDay(now);
  const [stations, stats] = await Promise.all([listCountedStations(), liveStationStats(since)]);

  const statsByStation = new Map(stats.map((row) => [row.stationId, row]));

  return {
    unit: 'roomEntries',
    asOf: now.toISOString(),
    stations: stations.map((station) => {
      const row = statsByStation.get(station.id);
      const lastActivityAt = row?.lastActivityAt ?? null;
      const minutesSince = lastActivityAt ? minutesBetween(lastActivityAt, now) : null;

      return {
        stationId: station.id,
        stationName: station.name,
        todayTotal: row?.total ?? 0,
        lastActivityAt: lastActivityAt?.toISOString() ?? null,
        minutesSinceLastActivity: minutesSince,
        activeCounterCount: row?.counters ?? 0,
        // No activity at all today counts as silent: that is exactly the case
        // where a counter never opened the app.
        silent: minutesSince === null || minutesSince >= SILENT_STATION_MINUTES,
      };
    }),
  };
}
