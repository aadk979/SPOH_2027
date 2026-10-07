import { prisma, type PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { logger } from '../logger/index.js';
import type { SettingKey, SettingScope } from './registry.js';
import { resolveSetting, type SettingLayer } from './resolve.js';

const SCOPES: Record<'PLATFORM' | 'EVENT' | 'STATION', SettingScope> = {
  PLATFORM: 'platform',
  EVENT: 'event',
  STATION: 'station',
};

type Row = {
  scope: 'PLATFORM' | 'EVENT' | 'STATION';
  scopeId: string;
  key: string;
  value: unknown;
  version: number;
};

/** Resolve one key for the event, or for a station when its registry entry allows one. */
export type NumericSettingResolver<Key extends SettingKey> = (
  key: Key,
  stationId?: string,
) => number;

function layerOf(row: Row): SettingLayer {
  return { scope: SCOPES[row.scope], value: row.value, version: row.version };
}

function numericResolution(key: SettingKey, layers: readonly SettingLayer[]): number {
  const resolved = resolveSetting(key, layers);
  for (const scope of resolved.invalidScopes) {
    logger.error({ key, scope }, 'stored setting is invalid; using the next scope');
  }
  return Number(resolved.value);
}

async function readRows(
  scope: EventScope,
  keys: readonly SettingKey[],
  db: PrismaTransactionClient,
): Promise<Row[]> {
  const event = await db.event.findUnique({
    where: { id: scope.eventId },
    select: { organisationId: true },
  });
  return db.setting.findMany({
    where: {
      key: { in: [...keys] },
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

function resolver<Key extends SettingKey>(rows: readonly Row[]): NumericSettingResolver<Key> {
  const cache = new Map<string, number>();
  return (key, stationId = '') => {
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
 * Read the event's organisation, then every permitted layer of `keys` in one
 * parameterised query, and resolve each key (and each station) station, event,
 * platform, then the compiled default, with the pure registry resolver deciding
 * which scopes count. Every row is named by this event, its organisation or one
 * of its stations' own event, so a same-code station or setting in another event
 * or organisation can never contribute. Invalid stored values fall through.
 * Pass the request's transaction client to read inside it.
 */
export async function prepareNumericSettings<Key extends SettingKey>(
  scope: EventScope,
  keys: readonly Key[],
  db: PrismaTransactionClient = prisma,
): Promise<NumericSettingResolver<Key>> {
  return resolver<Key>(await readRows(scope, keys, db));
}
