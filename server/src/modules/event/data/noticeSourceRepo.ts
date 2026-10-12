import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function archiveNoticeMetadata(scope: EventScope, db: PrismaTransactionClient) {
  return db.event.findUnique({ where: { id: scope.eventId },
    select: { name: true, status: true, lifecycleVersion: true } });
}
