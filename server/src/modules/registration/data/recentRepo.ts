import type { RecentCorrectionRecordsQuery } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { pageArgs } from '../../../platform/db/pagination.js';

/** Bounded, station-scoped correction selection; visitor identity data is never joined. */
export function findRecentRegistrations(scope: EventScope, query: RecentCorrectionRecordsQuery) {
  return prisma.registration.findMany({
    where: {
      eventId: scope.eventId,
      stationId: query.stationId,
      rehearsal: query.rehearsal,
      voided: false,
    },
    include: { captureCategory: { select: { code: true, label: true } } },
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    ...pageArgs(query),
  });
}
