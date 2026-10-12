import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Source text and device credentials are deliberately absent from the personal export. */
export function exportPersonalNotices(tx: PrismaTransactionClient, personId: string) {
  return tx.person.findUniqueOrThrow({ where: { id: personId }, select: {
    noticePreference: { select: { urgentPush: true, operationalPush: true, updatedAt: true } },
    notices: { select: { id: true, eventId: true, kind: true, priority: true, sourceKind: true,
      sourceId: true, transitionKey: true, createdAt: true, expiresAt: true, readAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  } });
}

export async function erasePersonalNotices(tx: PrismaTransactionClient, personId: string) {
  const owner = await tx.person.findUniqueOrThrow({ where: { id: personId },
    select: { notices: { select: { eventId: true } } } });
  // A platform recipient can have notices without an event membership.
  const eventIds = [...new Set(owner.notices.map((notice) => notice.eventId))];
  await tx.notice.deleteMany({ where: { eventId: { in: eventIds }, recipientPersonId: personId } });
  await tx.noticePreference.deleteMany({ where: { personId } });
}

export function clearEventNotices(tx: PrismaTransactionClient, scope: EventScope) {
  return tx.notice.deleteMany({ where: { eventId: scope.eventId } });
}
