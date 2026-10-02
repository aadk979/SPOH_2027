import type { EventStatus } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** All activity writers serialize against capture admission, Event before category. */
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
    select: { id: true, active: true },
  });
}

export function updateCategoryActivity(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; active: boolean; now: Date },
) {
  return input.tx.captureCategory.update({
    where: { eventId: scope.eventId, id: input.id },
    data: { active: input.active, updatedAt: input.now },
  });
}
