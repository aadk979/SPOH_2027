import type { ScopedOperationalSettingKey, ScopedSettingsReadQuery } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

type StoredRow = { key: string; value: unknown; version: number };
export type ScopedSettingRows = {
  platform: StoredRow[];
  event: StoredRow[];
  station: StoredRow[];
};
const SELECT = { key: true, value: true, version: true } as const;

export function scopedReadStation(
  tx: PrismaTransactionClient,
  scope: EventScope,
  stationId: string,
) {
  return tx.station.findFirst({
    where: { eventId: scope.eventId, id: stationId },
    select: { id: true },
  });
}

/** At most three bounded reads; event and organisation ownership are explicit. */
export async function scopedSettingRows(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: {
    organisationId: string;
    query: ScopedSettingsReadQuery;
    keys: ScopedOperationalSettingKey[];
  },
): Promise<ScopedSettingRows> {
  const { organisationId, query, keys } = input;
  const platform = await tx.setting.findMany({
    where: { scope: 'PLATFORM', scopeId: organisationId, eventId: null, key: { in: keys } },
    select: SELECT,
    take: keys.length,
  });
  const event = await tx.setting.findMany({
    where: { scope: 'EVENT', scopeId: scope.eventId, eventId: scope.eventId, key: { in: keys } },
    select: SELECT,
    take: keys.length,
  });
  const station = query.stationId
    ? await tx.setting.findMany({
        where: {
          scope: 'STATION',
          scopeId: query.stationId,
          eventId: scope.eventId,
          key: { in: keys },
        },
        select: SELECT,
        take: keys.length,
      })
    : [];
  return { platform, event, station };
}
