import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * The rules a capture write checks about its station. Pure: they read the
 * station they are given and throw, so they are tested without a database.
 */

/**
 * A capture needs an active station. Rejecting an inactive one here rather
 * than at the database keeps the failure legible: a volunteer whose station
 * was closed mid-shift gets a clear message instead of a foreign-key error.
 */
export function assertStationActive(station: { name: string; active: boolean }): void {
  if (!station.active) {
    throw new AppError(
      409,
      ERROR_CODES.STATION_INACTIVE,
      `${station.name} is no longer active. Check with your IC before recording here.`,
    );
  }
}

/**
 * Footfall may only be recorded for a room that is actually counted. Silently
 * accepting a tick for an uncounted station would put entries into a total
 * nobody expects them in (PRODUCT_BRIEF §0.1).
 */
export function assertStationCountsEntry(station: { name: string; countsEntry: boolean }): void {
  if (!station.countsEntry) {
    throw new AppError(
      409,
      ERROR_CODES.STATION_DOES_NOT_COUNT_ENTRY,
      `${station.name} is not a footfall-counted room.`,
    );
  }
}
