import type { CategoryScheduleCreationIntent } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function insertCategorySchedule(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    intent: CategoryScheduleCreationIntent;
    personId: string;
    now: Date;
  },
) {
  const runAt = new Date(input.intent.runAt);
  return input.tx.scheduledAction.create({
    data: {
      eventId: scope.eventId,
      type: 'taxonomy.setActive',
      createdByPersonId: input.personId,
      runAt,
      scheduledFor: runAt,
      createdAt: input.now,
      payload: { kind: 'category', id: input.intent.categoryId, active: input.intent.active },
    },
  });
}
export function findCategorySchedule(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; categoryId: string },
) {
  return input.tx.scheduledAction.findFirst({
    where: {
      eventId: scope.eventId,
      id: input.id,
      type: 'taxonomy.setActive',
      recurrence: null,
      dedupeKey: null,
      payload: { path: ['id'], equals: input.categoryId },
    },
  });
}
export type CategoryScheduleRow = NonNullable<Awaited<ReturnType<typeof findCategorySchedule>>>;
