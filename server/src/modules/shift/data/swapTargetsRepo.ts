import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export async function listSwapTargetRows(scope: EventScope, viewerId: string) {
  const rows = await prisma.eventMembership.findMany({
    where: {
      eventId: scope.eventId,
      status: 'ACTIVE',
      personId: { not: viewerId },
      person: { deactivatedAt: null },
    },
    select: { person: { select: { id: true, displayName: true } } },
    orderBy: [{ person: { displayName: 'asc' } }, { personId: 'asc' }],
  });
  return rows.map((row) => row.person);
}
