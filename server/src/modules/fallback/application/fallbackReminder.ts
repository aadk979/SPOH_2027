import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';
import { activeNoticeAudience, queueNotices } from '../../notification/index.js';
import {
  enqueueFallbackReminder,
  findOpenReminderWindow,
  findReminderEvent,
} from '../data/reminderRepo.js';

/**
 * An open fallback window is the one state that gets forgotten: the system comes
 * back, everybody returns to the app, and the paper tallies never get imported. So
 * the window reminds its declarer and the coordinators until somebody closes it.
 */
export async function scheduleFallbackReminder(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { windowId: string; sequence: number; now: Date },
) {
  const { organisationId } = await findReminderEvent(tx, scope);
  const every = await loadResolvedSetting(
    'fallback.reminderMinutes',
    { ...scope, organisationId },
    tx,
  );
  return enqueueFallbackReminder(tx, scope, {
    windowId: input.windowId,
    sequence: input.sequence,
    createdAt: input.now,
    runAt: new Date(input.now.getTime() + Number(every.value) * 60_000),
  });
}

/** A closed window ends the chain; an open one notifies and queues the next reminder. */
export async function remindOpenFallback(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { windowId: string; sequence: number; now: Date },
): Promise<boolean> {
  const window = await findOpenReminderWindow(tx, scope, input.windowId);
  if (!window) return false;
  await scheduleFallbackReminder(tx, scope, { ...input, sequence: input.sequence + 1 });
  const coordinators = await activeNoticeAudience(scope, { tx, minimumRole: 'DEPUTY_COORDINATOR' });
  await queueNotices(tx, scope, { kind: 'FALLBACK_REMINDER', priority: 'OPERATIONAL',
    source: { kind: 'FALLBACK', id: window.id }, transitionKey: `fallback:${window.id}:remind:${input.sequence}`,
    context: { type: 'fallback', sequence: input.sequence }, createdAt: input.now,
    recipientPersonIds: [...coordinators, window.declaredById] });
  return true;
}
