import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** This projection cannot return transient descriptors, even when the purge is late. */
export async function lostPersonNoticeMetadata(scope: EventScope, input: {
  db: PrismaTransactionClient; id: string; personId: string;
}) {
  const alert = await input.db.lostPersonAlert.findFirst({ where: { eventId: scope.eventId, id: input.id },
    select: { id: true, status: true, rehearsal: true, resolvedAt: true,
      event: { select: { status: true } } } });
  if (!alert) return null;
  const ack = await input.db.lostPersonAck.findFirst({ where: { eventId: scope.eventId,
    alertId: input.id, volunteerId: input.personId }, select: { id: true } });
  return { ...alert, acknowledged: !!ack };
}

export function activeLostPersonNoticeHistory(scope: EventScope, input: {
  db: PrismaTransactionClient; personId: string; limit: number;
}) {
  return input.db.$queryRaw<{ id: string; raisedAt: Date }[]>`SELECT a.id, a."raisedAt" FROM "LostPersonAlert" a
    JOIN "Event" e ON e.id = a."eventId" WHERE a."eventId" = ${scope.eventId} AND a.status = 'ACTIVE'
      AND (a.rehearsal = false OR e.status = 'REHEARSAL')
      AND NOT EXISTS (SELECT 1 FROM "Notice" n WHERE n."eventId" = a."eventId"
        AND n."recipientPersonId" = ${input.personId} AND n."sourceKind" = 'LOST_PERSON'
        AND n."sourceId" = a.id AND n.kind = 'LOST_PERSON_RAISED')
    ORDER BY a."raisedAt" DESC, a.id DESC LIMIT ${input.limit + 1}`;
}
