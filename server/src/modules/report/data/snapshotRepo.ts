import type { FullReport } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function saveFinalSnapshot(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { report: FullReport; lifecycleVersion: number; personId: string; createdAt: Date },
) {
  return tx.reportSnapshot.create({
    data: {
      eventId: scope.eventId,
      kind: 'FINAL',
      lifecycleVersion: input.lifecycleVersion,
      dedupeKey: `final:${input.lifecycleVersion}`,
      rehearsalIncluded: false,
      report: input.report,
      createdByPersonId: input.personId,
      createdAt: input.createdAt,
    },
  });
}

export function activeFinalSnapshot(tx: PrismaTransactionClient, scope: EventScope) {
  return tx.reportSnapshot.findFirst({
    where: { eventId: scope.eventId, kind: 'FINAL', supersededAt: null },
    orderBy: { lifecycleVersion: 'desc' },
  });
}
