import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { endArchivedMemberships } from '../data/archiveMembershipRepo.js';
import { cancelArchiveReminders } from '../data/archiveReminderRepo.js';

/** Storage prerequisite only; archive requests stay unavailable until write/access/retention enforcement. */
export async function archiveEvent(tx: PrismaTransactionClient, scope: EventScope, now: Date) {
  const endedMemberships = await endArchivedMemberships(tx, scope);
  const cancelledArchiveReminderIds = await cancelArchiveReminders(tx, scope, now);
  return { endedMemberships, cancelledArchiveReminderIds };
}
