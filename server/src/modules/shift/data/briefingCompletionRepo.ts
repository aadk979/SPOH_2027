import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export const findBriefingForCompletion = (
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
) =>
  tx.briefingSlot.findFirst({
    where: { eventId: scope.eventId, id },
    select: { id: true, completedAt: true },
  });

export async function completePendingBriefing(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { id: string; notes: string | undefined; completedAt: Date },
) {
  const result = await tx.briefingSlot.updateMany({
    where: { eventId: scope.eventId, id: input.id, completedAt: null },
    data: { completedAt: input.completedAt, ...(input.notes ? { notes: input.notes } : {}) },
  });
  return result.count === 1;
}
