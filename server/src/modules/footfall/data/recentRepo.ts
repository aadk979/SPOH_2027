import type { RecentCorrectionRecordsQuery } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { pageArgs } from '../../../platform/db/pagination.js';

export function findRecentFootfall(scope: EventScope, query: RecentCorrectionRecordsQuery) {
  return prisma.footfallTick.findMany({
    where: {
      eventId: scope.eventId,
      stationId: query.stationId,
      rehearsal: query.rehearsal,
      voided: false,
    },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    ...pageArgs(query),
  });
}
