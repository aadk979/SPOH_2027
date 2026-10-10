import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { AuditContext } from '../../../platform/audit/index.js';
import { scheduleArchivedRetention } from '../../people/index.js';
import { endArchivedMemberships } from '../data/archiveMembershipRepo.js';
import { cancelArchiveReminders } from '../data/archiveReminderRepo.js';

/** Read-only admission, ended memberships and retention deadlines share the transition's fate. */
export async function archiveEvent(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; now: Date; audit: AuditContext },
) {
  const { scope, now, audit } = input;
  const endedMemberships = await endArchivedMemberships(tx, scope);
  const cancelledArchiveReminderIds = await cancelArchiveReminders(tx, scope, now);
  await scheduleArchivedRetention(tx, {
    eventId: scope.eventId,
    archivedAt: now,
    audit,
  });
  return { endedMemberships, cancelledArchiveReminderIds };
}
