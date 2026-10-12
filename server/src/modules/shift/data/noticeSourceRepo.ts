import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function swapNoticeMetadata(scope: EventScope, input: { db: PrismaTransactionClient; id: string }) {
  return input.db.shiftSwapRequest.findFirst({ where: { eventId: scope.eventId, id: input.id },
    select: { id: true, requesterId: true, targetId: true, status: true } });
}
export function withdrawalNoticeParticipants(scope: EventScope, input: { tx: PrismaTransactionClient; id: string }) {
  return input.tx.shiftSwapRequest.findFirst({ where: { eventId: scope.eventId, id: input.id },
    select: { requesterId: true, targetId: true } });
}
