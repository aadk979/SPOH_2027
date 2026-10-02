import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { supersedeFinalReport } from '../../report/index.js';
import { cancelArchiveReminders } from '../data/archiveReminderRepo.js';

/** Reopen supersedes evidence and cancels obsolete delivery in the phase transaction. */
export async function reopenEvent(tx: PrismaTransactionClient, scope: EventScope, now: Date) {
  const supersededFinalSnapshotIds = await supersedeFinalReport(tx, scope, now);
  const cancelledArchiveReminderIds = await cancelArchiveReminders(tx, scope, now);
  return { supersededFinalSnapshotIds, cancelledArchiveReminderIds };
}
