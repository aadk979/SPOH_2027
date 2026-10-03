import type { EventSettingKey, EventSettings, EventSettingsResponse } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { logger } from '../logger/index.js';
import { EVENT_SETTINGS } from './registry.js';

const KEYS = Object.keys(EVENT_SETTINGS) as EventSettingKey[];

/** A stored value, or the default when there is none or it fails its schema (ADR-003 §2). */
function resolved<Key extends EventSettingKey>(
  key: Key,
  row: { value: unknown } | undefined,
): EventSettings[Key] {
  const definition = EVENT_SETTINGS[key];
  if (!row) return definition.default as EventSettings[Key];
  const parsed = definition.schema.safeParse(row.value);
  if (parsed.success) return parsed.data as EventSettings[Key];
  logger.error(
    { key, issues: parsed.error.issues },
    'stored event setting is invalid; using the default',
  );
  return definition.default as EventSettings[Key];
}

/** Every event setting with its stored version (0 while it is the default). */
export async function eventSettings(
  scope: EventScope,
  db: PrismaTransactionClient = prisma,
): Promise<EventSettingsResponse> {
  const rows = await db.setting.findMany({
    where: { eventId: scope.eventId, scope: 'EVENT', scopeId: scope.eventId, key: { in: KEYS } },
    select: { key: true, value: true, version: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return {
    settings: {
      'product.countsMode': resolved('product.countsMode', byKey.get('product.countsMode')),
      'product.visitorDataMode': resolved(
        'product.visitorDataMode',
        byKey.get('product.visitorDataMode'),
      ),
    },
    versions: {
      'product.countsMode': byKey.get('product.countsMode')?.version ?? 0,
      'product.visitorDataMode': byKey.get('product.visitorDataMode')?.version ?? 0,
    },
  };
}

/** One event setting's value. */
export async function eventSetting<Key extends EventSettingKey>(
  scope: EventScope,
  key: Key,
  db: PrismaTransactionClient = prisma,
): Promise<EventSettings[Key]> {
  return (await eventSettings(scope, db)).settings[key];
}
