import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** A publication fixes the exact private version and the action that first published it. */
export function recordPublication(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    draftId: string;
    version: number;
    announcementId: string;
    scheduledActionId: string;
    now: Date;
  },
) {
  return input.tx.announcementPublication.create({
    data: {
      eventId: scope.eventId,
      draftId: input.draftId,
      version: input.version,
      announcementId: input.announcementId,
      scheduledActionId: input.scheduledActionId,
      publishedAt: input.now,
    },
  });
}
