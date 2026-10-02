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

/** A worker must take the event lock before its action row when executing this reminder. */
export async function cancelArchiveReminders(
  tx: PrismaTransactionClient,
  scope: EventScope,
  now: Date,
) {
  const rows = await tx.scheduledAction.updateManyAndReturn({
    where: {
      eventId: scope.eventId,
      type: 'event.archiveReminder',
      status: { in: ['PENDING', 'RUNNING'] },
    },
    data: {
      status: 'CANCELLED',
      completedAt: now,
      lockedBy: null,
      lockedUntil: null,
      version: { increment: 1 },
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
