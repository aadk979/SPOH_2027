import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export async function fallbackNoticeMetadata(scope: EventScope, input: {
  db: PrismaTransactionClient; id: string; sequence: number;
}) {
  const window = await input.db.fallbackWindow.findFirst({ where: { eventId: scope.eventId,
    id: input.id, endedAt: null }, select: { id: true, stationId: true, declaredById: true } });
  if (!window) return null;
  const action = await input.db.scheduledAction.findFirst({ where: { eventId: scope.eventId,
    dedupeKey: `event:${scope.eventId}:fallback:${input.id}:remind:${input.sequence}`,
    type: 'fallback.remind', status: { in: ['RUNNING', 'SUCCEEDED'] } }, select: { id: true } });
  return action ? window : null;
}

export function fallbackNoticeMember(scope: EventScope, input: { db: PrismaTransactionClient; membershipId: string; personId: string }) {
  return input.db.eventMembership.findFirst({ where: { eventId: scope.eventId, id: input.membershipId,
    personId: input.personId, status: 'ACTIVE' }, select: { role: true } });
}
