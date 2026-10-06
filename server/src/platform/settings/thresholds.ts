import { prisma, type PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { logger } from '../logger/index.js';
import type { SettingKey, SettingScope } from './registry.js';
import { resolveSetting, type SettingLayer } from './resolve.js';

/** The four operational thresholds that resolve from the scoped store (ADR-003 §2). */
const KEYS = [
  'silentStationMinutes',
  'staleDeviceMinutes',
  'implausibleTapsPerMinute',
  'longShiftMinutes',
] as const satisfies readonly SettingKey[];
type ThresholdKey = (typeof KEYS)[number];

const SCOPES: Record<'PLATFORM' | 'EVENT' | 'STATION', SettingScope> = {
  PLATFORM: 'platform',
  EVENT: 'event',
  STATION: 'station',
};

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

type Row = {
  scope: 'PLATFORM' | 'EVENT' | 'STATION';
  scopeId: string;
  key: string;
  value: unknown;
  version: number;
};

function layerOf(row: Row): SettingLayer {
  return { scope: SCOPES[row.scope], value: row.value, version: row.version };
}

function numericResolution(key: ThresholdKey, layers: readonly SettingLayer[]): number {
  const resolved = resolveSetting(key, layers);
  for (const scope of resolved.invalidScopes) {
    logger.error({ key, scope }, 'stored setting is invalid; using the next scope');
  }
  return Number(resolved.value);
}

async function readRows(scope: EventScope, db: PrismaTransactionClient): Promise<Row[]> {
  const event = await db.event.findUnique({
    where: { id: scope.eventId },
    select: { organisationId: true },
  });
  return db.setting.findMany({
    where: {
      key: { in: [...KEYS] },
      OR: [
        { scope: 'EVENT', scopeId: scope.eventId, eventId: scope.eventId },
        { scope: 'STATION', eventId: scope.eventId },
        ...(event
          ? [{ scope: 'PLATFORM' as const, scopeId: event.organisationId, eventId: null }]
          : []),
      ],
    },
    select: { scope: true, scopeId: true, key: true, value: true, version: true },
  });
}

/** Resolve one key for an event, and for a station when its registry entry allows one. */
function resolver(rows: readonly Row[]) {
  const cache = new Map<string, number>();
  return (key: ThresholdKey, stationId = ''): number => {
    const id = `${key}:${stationId}`;
    const known = cache.get(id);
    if (known !== undefined) return known;
    const layers = rows
      .filter(
        (row) =>
          row.key === key &&
          (row.scope !== 'STATION' || (stationId !== '' && row.scopeId === stationId)),
      )
      .map(layerOf);
    const value = numericResolution(key, layers);
    cache.set(id, value);
    return value;
  };
}

/**
 * Read the event's organisation, then every permitted layer in one parameterised
 * query, and resolve each key
 * (and each station) with the pure registry resolver. Every row is named by this
 * event, its organisation or one of its stations' own event, so a same-code
 * station or setting in another event or organisation can never contribute.
 * Pass the request's transaction client to read inside it.
 */
export async function prepareThresholds(
  scope: EventScope,
  db: PrismaTransactionClient = prisma,
): Promise<ThresholdSnapshot> {
  const resolve = resolver(await readRows(scope, db));
  return {
    silentStationMinutes: (stationId) => resolve('silentStationMinutes', stationId),
    implausibleTapsPerMinute: (stationId) => resolve('implausibleTapsPerMinute', stationId),
    staleDeviceMinutes: () => resolve('staleDeviceMinutes'),
    longShiftMinutes: () => resolve('longShiftMinutes'),
  };
}
