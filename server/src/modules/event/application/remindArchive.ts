import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { dispatch } from '../../notification/index.js';
import { findArchiveReminderTarget } from '../data/archiveReminderRepo.js';

/**
 * ADR-004: closing schedules the ARCHIVED reminder once the late-sync grace has passed.
 * Only platform admins may archive, so only they are told. A reopen or an archive
 * cancels the reminder; the version check covers a close that raced either.
 */
export async function remindArchive(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { lifecycleVersion: number; now: Date },
): Promise<boolean> {
  const { event, adminIds } = await findArchiveReminderTarget(tx, scope);
  if (event.status !== 'CLOSED' || event.lifecycleVersion !== input.lifecycleVersion) return false;
  if (adminIds.length === 0) return false;
  void dispatch(
    scope,
    {
      kind: 'event.archiveReminder',
      priority: 'OPERATIONAL',
      title: `${event.name} is ready to archive`,
      body: 'Late captures can no longer arrive. Check the close-out list, export the final report, then archive the event.',
      url: '/overview',
      tag: `archive-reminder:${scope.eventId}`,
      audience: { everyone: false, volunteerIds: adminIds },
    },
    input.now,
  );
  return true;
}
