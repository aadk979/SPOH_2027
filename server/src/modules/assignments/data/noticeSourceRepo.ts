import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function assignmentNoticeMetadata(scope: EventScope, input: { db: PrismaTransactionClient; id: string }) {
  return input.db.shiftAssignment.findFirst({ where: { eventId: scope.eventId, id: input.id },
    select: { id: true, volunteerId: true, stationId: true, eventDayId: true, shiftId: true } });
}
