import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export const ARCHIVED_INCIDENT_TEXT = 'Archived incident description';
export const ARCHIVED_FOLLOW_UP_TEXT = 'Archived incident follow-up';

/** Mutable source text expires separately from frozen reports and append-only audit history. */
export async function clearArchivedDescriptors(tx: PrismaTransactionClient, scope: EventScope) {
  const incidents = await tx.incident.updateMany({ where: { eventId: scope.eventId,
    OR: [{ description: { not: ARCHIVED_INCIDENT_TEXT } }, { locationNote: { not: null } }] },
    data: { description: ARCHIVED_INCIDENT_TEXT, locationNote: null } });
  const followUps = await tx.incidentFollowUp.updateMany({ where: { eventId: scope.eventId,
    note: { not: ARCHIVED_FOLLOW_UP_TEXT } }, data: { note: ARCHIVED_FOLLOW_UP_TEXT } });
  const items = await tx.lostFoundItem.updateMany({ where: { eventId: scope.eventId,
    holderNote: { not: null } }, data: { holderNote: null } });
  const swaps = await tx.shiftSwapRequest.updateMany({ where: { eventId: scope.eventId,
    reason: { not: null } }, data: { reason: null } });
  return incidents.count + followUps.count + items.count + swaps.count;
}
