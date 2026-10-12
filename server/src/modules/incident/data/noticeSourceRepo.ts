import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function incidentNoticeMetadata(scope: EventScope, input: { db: PrismaTransactionClient; id: string }) {
  return input.db.incident.findFirst({ where: { eventId: scope.eventId, id: input.id },
    select: { id: true, severity: true, rehearsal: true, reportedById: true } });
}
