import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** The immutable issuance receipt binds a generated object key to one event. */
export function mediaUploadReceipt(tx: PrismaTransactionClient, scope: EventScope, key: string) {
  return tx.auditLog.findFirst({
    where: {
      eventId: scope.eventId,
      action: 'media.upload',
      entityType: 'MediaObject',
      entityId: key,
      outcome: 'SUCCESS',
    },
    select: { id: true, after: true },
  });
}
