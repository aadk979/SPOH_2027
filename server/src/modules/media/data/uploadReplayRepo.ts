import type { EventScope } from '../../../platform/db/eventScope.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';

/** An id-only replay receipt must still name this event and the issuing person. */
export function uploadIntentForReplay(
  scope: EventScope,
  tx: PrismaTransactionClient,
  { key, personId }: { key: string; personId: string },
) {
  return tx.auditLog.findFirst({
    where: {
      eventId: scope.eventId,
      actorId: personId,
      action: 'media.upload',
      entityType: 'MediaObject',
      entityId: key,
      outcome: 'SUCCESS',
    },
    select: { after: true },
  });
}
