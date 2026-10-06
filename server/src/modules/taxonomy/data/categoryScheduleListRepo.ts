import type { CategoryScheduleListQuery } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

function categoryFilter(scope: EventScope, categoryId: string): Prisma.ScheduledActionWhereInput {
  return {
    eventId: scope.eventId,
    type: 'taxonomy.setActive',
    recurrence: null,
    dedupeKey: null,
    createdByPersonId: { not: null },
    AND: [
      { payload: { path: ['kind'], equals: 'category' } },
      { payload: { path: ['id'], equals: categoryId } },
    ],
  };
}
export function categoryScheduleCursor(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; categoryId: string; id: string },
) {
  return input.tx.scheduledAction.findFirst({
    where: { ...categoryFilter(scope, input.categoryId), id: input.id },
    select: { id: true, createdAt: true },
  });
}
export function categoryScheduleRows(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    categoryId: string;
    query: CategoryScheduleListQuery;
    cursor: { id: string; createdAt: Date } | null;
  },
) {
  const { query, cursor } = input;
  return input.tx.scheduledAction.findMany({
    where: {
      ...categoryFilter(scope, input.categoryId),
      ...(query.status ? { status: query.status } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
}
