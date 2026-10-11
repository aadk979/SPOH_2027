import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export const ownSwapForWithdrawal = (
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { id: string; requesterId: string },
) =>
  tx.shiftSwapRequest.findFirst({
    where: { eventId: scope.eventId, ...input },
    select: { id: true, status: true },
  });

export async function cancelOwnPendingSwap(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { id: string; requesterId: string },
) {
  const result = await tx.shiftSwapRequest.updateMany({
    where: { eventId: scope.eventId, ...input, status: 'REQUESTED' },
    data: { status: 'CANCELLED' },
  });
  return result.count === 1;
}
