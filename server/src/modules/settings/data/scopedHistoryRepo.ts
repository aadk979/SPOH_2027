import type { ScopedOperationalSettingKey, ScopedSettingsTarget } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const HISTORY = {
  id: true,
  key: true,
  version: true,
  before: true,
  after: true,
  source: true,
  reason: true,
  actorPersonId: true,
  createdAt: true,
} satisfies Prisma.SettingChangeSelect;
export type ScopedHistoryRow = Prisma.SettingChangeGetPayload<{ select: typeof HISTORY }>;
type Selection = { key: ScopedOperationalSettingKey; target: ScopedSettingsTarget };
const owned = (scope: EventScope, selection: Selection) => ({
  eventId: scope.eventId,
  scope: selection.target.scope === 'event' ? ('EVENT' as const) : ('STATION' as const),
  scopeId: selection.target.scope === 'event' ? scope.eventId : selection.target.stationId,
  key: selection.key,
});
export function scopedHistoryCursor(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: Selection & { cursor: string },
) {
  return tx.settingChange.findFirst({
    where: { ...owned(scope, input), id: input.cursor },
    select: { id: true, createdAt: true },
  });
}
export function scopedHistoryRows(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: Selection & { limit: number; cursor: Pick<ScopedHistoryRow, 'id' | 'createdAt'> | null },
) {
  const { cursor } = input;
  return tx.settingChange.findMany({
    where: {
      ...owned(scope, input),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    select: HISTORY,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
  });
}
