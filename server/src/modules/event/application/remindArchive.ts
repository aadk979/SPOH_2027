import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { queueNotices } from '../../notification/index.js';
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
  await queueNotices(tx, scope, { kind: 'ARCHIVE_REMINDER', priority: 'OPERATIONAL',
    source: { kind: 'EVENT', id: scope.eventId }, transitionKey: `event:${scope.eventId}:archive:${input.lifecycleVersion}`,
    context: { type: 'event', lifecycleVersion: input.lifecycleVersion }, createdAt: input.now,
    recipientPersonIds: adminIds });
  return true;
}
