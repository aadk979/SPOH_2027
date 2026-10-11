import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export const FALLBACK_REMINDER = 'fallback.remind';

/** A system action: the reminder outlives nobody's authority because it only notifies. */
export function enqueueFallbackReminder(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { windowId: string; sequence: number; runAt: Date; createdAt: Date },
) {
  const { windowId, sequence, runAt, createdAt } = input;
  return tx.scheduledAction.create({
    data: {
      eventId: scope.eventId,
      type: FALLBACK_REMINDER,
      payload: { windowId, sequence },
      dedupeKey: `event:${scope.eventId}:fallback:${windowId}:remind:${sequence}`,
      runAt,
      createdAt,
    },
    select: { id: true },
  });
}

export function findReminderEvent(tx: PrismaTransactionClient, scope: EventScope) {
  return tx.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { organisationId: true, timezone: true },
  });
}

/** The open window a reminder is about, or null once it has closed. */
export function findOpenReminderWindow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  windowId: string,
) {
  return tx.fallbackWindow.findFirst({
    where: { id: windowId, eventId: scope.eventId, endedAt: null },
    select: { id: true, tier: true, startedAt: true, stationId: true, declaredById: true },
  });
}
