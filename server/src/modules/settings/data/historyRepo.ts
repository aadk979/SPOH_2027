import type { EventSettingHistoryQuery } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const HISTORY = {
  id: true,
  eventId: true,
  key: true,
  version: true,
  before: true,
  after: true,
  source: true,
  reason: true,
  actorPersonId: true,
  createdAt: true,
} satisfies Prisma.SettingChangeSelect;
export type EventSettingHistoryRow = Prisma.SettingChangeGetPayload<{ select: typeof HISTORY }>;
const ownedHistory = (scope: EventScope, key: string) => ({
  eventId: scope.eventId,
  scope: 'EVENT' as const,
  scopeId: scope.eventId,
  key,
});

export function eventSettingHistoryCursor(
  tx: PrismaTransactionClient,
  scope: EventScope,
  query: EventSettingHistoryQuery,
) {
  return tx.settingChange.findFirst({
    where: { ...ownedHistory(scope, query.key), id: query.cursor },
    select: { id: true, createdAt: true },
  });
}
export function eventSettingHistoryRows(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: {
    query: EventSettingHistoryQuery;
    cursor: Pick<EventSettingHistoryRow, 'id' | 'createdAt'> | null;
  },
) {
  const { query, cursor } = input;
  return tx.settingChange.findMany({
    where: {
      ...ownedHistory(scope, query.key),
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
    take: query.limit + 1,
  });
}
