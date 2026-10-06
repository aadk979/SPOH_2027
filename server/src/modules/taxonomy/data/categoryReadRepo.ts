import type { CategoryActivityListQuery, EventStatus } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const CATEGORY = {
  id: true,
  code: true,
  label: true,
  sortOrder: true,
  active: true,
  updatedAt: true,
  createdAt: true,
} as const;

/** Every category activity writer already uses Event UPDATE against capture admission. */
export async function lockCategoryEvent(scope: EventScope, tx: PrismaTransactionClient) {
  const rows = await tx.$queryRaw<Array<{ status: EventStatus }>>`
    SELECT status FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return rows[0];
}
export function findCategoryActivity(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string },
) {
  return input.tx.captureCategory.findUnique({
    where: { eventId: scope.eventId, id: input.id },
    select: CATEGORY,
  });
}
export type CategoryActivityRow = NonNullable<Awaited<ReturnType<typeof findCategoryActivity>>>;

export function categoryActivityCursor(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string },
) {
  return input.tx.captureCategory.findFirst({
    where: { eventId: scope.eventId, id: input.id },
    select: { id: true, createdAt: true },
  });
}
export function categoryActivityRows(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    query: CategoryActivityListQuery;
    cursor: { id: string; createdAt: Date } | null;
  },
) {
  const { query, cursor } = input;
  return input.tx.captureCategory.findMany({
    where: {
      eventId: scope.eventId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    select: CATEGORY,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
}
