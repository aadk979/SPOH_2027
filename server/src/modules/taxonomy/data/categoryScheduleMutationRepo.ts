import type { CategoryScheduleCreationIntent } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { findCategorySchedule } from './categoryScheduleRepo.js';

export async function lockCategorySchedule(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; categoryId: string },
) {
  await input.tx
    .$queryRaw`SELECT id FROM "ScheduledAction" WHERE "eventId" = ${scope.eventId} AND id = ${input.id} FOR UPDATE`;
  return findCategorySchedule(scope, input);
}
export function editCategorySchedule(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    id: string;
    version: number;
    intent: CategoryScheduleCreationIntent;
  },
) {
  const runAt = new Date(input.intent.runAt);
  return input.tx.scheduledAction.update({
    where: { eventId: scope.eventId, id: input.id, version: input.version, status: 'PENDING' },
    data: {
      runAt,
      scheduledFor: runAt,
      version: { increment: 1 },
      payload: { kind: 'category', id: input.intent.categoryId, active: input.intent.active },
    },
  });
}
export function cancelCategoryScheduleRow(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; version: number; now: Date },
) {
  return input.tx.scheduledAction.update({
    where: { eventId: scope.eventId, id: input.id, version: input.version, status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      completedAt: input.now,
      lockedBy: null,
      lockedUntil: null,
      version: { increment: 1 },
    },
  });
}
