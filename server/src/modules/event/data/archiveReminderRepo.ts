import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** Queue storage only; P10.6/P10.7 wire execution and delivery. */
export function enqueueArchiveReminder(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { lifecycleVersion: number; runAt: Date; createdAt: Date },
) {
  return tx.scheduledAction.create({
    data: {
      eventId: scope.eventId,
      type: 'event.archiveReminder',
      payload: { lifecycleVersion: input.lifecycleVersion },
      dedupeKey: `event:${scope.eventId}:archive-reminder:${input.lifecycleVersion}`,
      runAt: input.runAt,
      createdAt: input.createdAt,
    },
    select: { id: true },
  });
}
