import type { FallbackWindowRecord } from '@spoh/shared';
import { minutesBetween } from '../../../platform/time/index.js';
import { toWindowRecord } from '../data/mappers.js';
import { findStationName, findVolunteerName, type WindowRow } from '../data/repo.js';

/** A window as the API shows it: who declared it, where, and for how long. */
export async function windowRecord(window: WindowRow): Promise<FallbackWindowRecord> {
  const [declaredByName, stationName] = await Promise.all([
    findVolunteerName(window.declaredById),
    window.stationId ? findStationName(window.stationId) : Promise.resolve(null),
  ]);
  const duration = window.endedAt ? minutesBetween(window.startedAt, window.endedAt) : null;
  return toWindowRecord(window, { declaredByName, stationName }, duration);
}
