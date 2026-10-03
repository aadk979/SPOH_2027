import type { ScheduleTimelineQuery } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const METADATA = {
  id: true,
  eventId: true,
  type: true,
  scheduledFor: true,
  runAt: true,
  status: true,
  version: true,
  attempts: true,
  maxAttempts: true,
  recurrence: true,
  createdByPersonId: true,
  createdAt: true,
  completedAt: true,
  lastError: true,
} satisfies Prisma.ScheduledActionSelect;
export type TimelineRow = Prisma.ScheduledActionGetPayload<{ select: typeof METADATA }>;

/** Never load action payloads, dedupe keys or lease tokens for the timeline. */
export async function timelineRows(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { query: ScheduleTimelineQuery; cursor: Pick<TimelineRow, 'id' | 'createdAt'> | null },
) {
  const { query, cursor } = input;
  return tx.scheduledAction.findMany({
    where: {
      eventId: scope.eventId,
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
    select: METADATA,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    // Explicit immutable keyset bounds retain the next row when a cursor changes status.
    take: query.limit + 1,
  });
}

export function timelineCursor(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  return tx.scheduledAction.findFirst({
    where: { eventId: scope.eventId, id },
    select: { id: true, createdAt: true },
  });
}
