import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Practice and live descriptions both need their completed privacy purge before archive. */
export function countUnpurgedResolvedAlerts(tx: PrismaTransactionClient, scope: EventScope) {
  return tx.lostPersonAlert.count({
    where: {
      eventId: scope.eventId,
      status: { not: 'ACTIVE' },
      OR: [
        { purgedAt: null },
        { approxAge: { not: null } },
        { descriptionText: { not: null } },
        { clothingText: { not: null } },
      ],
    },
  });
}
