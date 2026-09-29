import type { FallbackWindowRecord } from '@spoh/shared';
import { minutesBetween } from '../../../platform/time/index.js';
import { findStationNames } from '../../station/index.js';
import { toWindowRecord } from '../data/mappers.js';
import { findVolunteerNames, type WindowRow } from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Windows as the API shows them: who declared each, where, and for how long.
 * Names for the whole list come from one query per table, not two per window
 * (F03-029).
 */
export async function windowRecords(
  scope: EventScope,
  windows: readonly WindowRow[],
): Promise<FallbackWindowRecord[]> {
  const [declarers, stations] = await Promise.all([
    findVolunteerNames(windows.map((window) => window.declaredById)),
    findStationNames(
      scope,
      windows.flatMap((window) => (window.stationId ? [window.stationId] : [])),
    ),
  ]);
  return windows.map((window) =>
    toWindowRecord(
      window,
      {
        declaredByName: declarers.get(window.declaredById) ?? null,
        stationName: window.stationId ? (stations.get(window.stationId) ?? null) : null,
      },
      window.endedAt ? minutesBetween(window.startedAt, window.endedAt) : null,
    ),
  );
}

export async function windowRecord(
  scope: EventScope,
  window: WindowRow,
): Promise<FallbackWindowRecord> {
  const [record] = await windowRecords(scope, [window]);
  return record as FallbackWindowRecord;
}
