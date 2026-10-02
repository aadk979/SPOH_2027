import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';
import { closeOpenWindows } from '../../fallback/index.js';
import { markUnclaimedInTransaction } from '../../lostFound/index.js';
import { freezeFinalReport } from '../../report/index.js';
import { enqueueArchiveReminder } from '../data/archiveReminderRepo.js';

/** Under the exclusive event lock, every effect shares the transition's fate. */
export async function closeEvent(
  tx: PrismaTransactionClient,
  input: { actor: ActorContext; organisationId: string; version: number; now: Date },
) {
  const { actor, organisationId, version, now } = input;
  const { scope } = actor;
  const closedWindows = await closeOpenWindows(tx, scope, now);
  const unclaimedItems = await markUnclaimedInTransaction(tx, actor);
  const finalSnapshotId = await freezeFinalReport(tx, scope, {
    lifecycleVersion: version,
    personId: actor.volunteerId,
    clock: { now: () => now },
  });
  const grace = await loadResolvedSetting(
    'capture.lateSyncHours',
    { ...scope, organisationId },
    tx,
  );
  const reminder = await enqueueArchiveReminder(tx, scope, {
    lifecycleVersion: version,
    createdAt: now,
    runAt: new Date(now.getTime() + Number(grace.value) * 3600_000),
  });
  return { closedWindows, unclaimedItems, finalSnapshotId, archiveReminderId: reminder.id };
}
