import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';
import { minutesBetween } from '../../../platform/time/index.js';

/**
 * COUNT 2 — footfall (PRODUCT_BRIEF §3). Increment-only with undo: there is no
 * edit of a tick's time or quantity after the fact, because editable history
 * is how tallies get "tidied up" into fiction. A wrong tick is voided, and the
 * void is visible.
 */

export function assertTickNotVoided(tick: { voided: boolean }): void {
  if (tick.voided) {
    throw new AppError(409, ERROR_CODES.ALREADY_VOIDED, 'This tick is already voided');
  }
}

/** Bucket rows grouped per station, in the order the query returned them. */
export function bucketsByStation(
  rows: ReadonlyArray<{ stationId: string; bucket: Date; total: number }>,
): Map<string, Array<{ bucketStart: string; value: number }>> {
  const byStation = new Map<string, Array<{ bucketStart: string; value: number }>>();
  for (const row of rows) {
    const list = byStation.get(row.stationId) ?? [];
    list.push({ bucketStart: row.bucket.toISOString(), value: row.total });
    byStation.set(row.stationId, list);
  }
  return byStation;
}

/**
 * One counted room on the live board. No activity at all today counts as
 * silent: that is exactly the case where a counter never opened the app.
 */
interface StationStats {
  total: number;
  lastActivityAt: Date | null;
  counters: number;
}

const NO_ACTIVITY: StationStats = { total: 0, lastActivityAt: null, counters: 0 };

export function liveStationRow(
  station: { id: string; name: string },
  stats: StationStats | undefined,
  at: { now: Date; silentAfterMinutes: number },
) {
  const { total, lastActivityAt, counters } = stats ?? NO_ACTIVITY;
  const minutesSince = lastActivityAt ? minutesBetween(lastActivityAt, at.now) : null;
  return {
    stationId: station.id,
    stationName: station.name,
    todayTotal: total,
    lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
    minutesSinceLastActivity: minutesSince,
    activeCounterCount: counters,
    silent: minutesSince === null || minutesSince >= at.silentAfterMinutes,
  };
}
