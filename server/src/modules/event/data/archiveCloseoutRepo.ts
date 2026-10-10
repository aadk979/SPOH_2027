import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Read under the lifecycle event lock, so close-out state cannot change during archive. */
export async function archiveCloseoutFacts(scope: EventScope, tx: PrismaTransactionClient) {
  return {
    lostFoundClosed:
      (await tx.lostFoundItem.count({ where: { eventId: scope.eventId, status: 'HELD' } })) === 0,
    fallbackWindowsClosed:
      (await tx.fallbackWindow.count({ where: { eventId: scope.eventId, endedAt: null } })) === 0,
  };
}
