import { prisma, type PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { prepareNumericSettings } from './numericSnapshot.js';
import type { SettingKey } from './registry.js';

/** The four operational thresholds that resolve from the scoped store (ADR-003 §2). */
const KEYS = [
  'silentStationMinutes',
  'staleDeviceMinutes',
  'implausibleTapsPerMinute',
  'longShiftMinutes',
] as const satisfies readonly SettingKey[];

/**
 * One immutable observation of the four thresholds for an event, prepared once
 * per request and handed to every panel that needs it, so two panels of the same
 * response cannot disagree about when a station is silent.
 */
export interface ThresholdSnapshot {
  /** Station, event, platform, then the compiled default; the registry decides which scopes count. */
  silentStationMinutes(stationId: string): number;
  implausibleTapsPerMinute(stationId: string): number;
  /** Event-wide only: the registry allows no station or platform value. */
  staleDeviceMinutes(): number;
  longShiftMinutes(): number;
}

/** See `prepareNumericSettings`: one query, then the pure registry resolver per key and station. */
export async function prepareThresholds(
  scope: EventScope,
  db: PrismaTransactionClient = prisma,
): Promise<ThresholdSnapshot> {
  const resolve = await prepareNumericSettings(scope, KEYS, db);
  return {
    silentStationMinutes: (stationId) => resolve('silentStationMinutes', stationId),
    implausibleTapsPerMinute: (stationId) => resolve('implausibleTapsPerMinute', stationId),
    staleDeviceMinutes: () => resolve('staleDeviceMinutes'),
    longShiftMinutes: () => resolve('longShiftMinutes'),
  };
}
