import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Called under the exclusive lifecycle event lock, before transaction completion. */
export async function endArchivedMemberships(tx: PrismaTransactionClient, scope: EventScope) {
  const result = await tx.eventMembership.updateMany({
    where: { eventId: scope.eventId, status: { not: 'ENDED' } },
    data: { status: 'ENDED' },
  });
  return result.count;
}
