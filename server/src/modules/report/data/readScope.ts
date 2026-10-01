import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { ReportingScope } from '../../../platform/db/rehearsalFilter.js';

/** Every section reads through the same transaction, including its named event. */
export interface ReportReadScope extends ReportingScope {
  db: PrismaTransactionClient;
}

export async function findReportEvent(scope: ReportReadScope) {
  return scope.db.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { name: true, slug: true, status: true, timezone: true, dayBoundaryMinutes: true },
  });
}
