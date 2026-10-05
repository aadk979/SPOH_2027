import type { CaptureScheduleIntent } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export function insertCaptureSchedule(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { intent: CaptureScheduleIntent; personId: string; now: Date },
) {
  const { intent } = input;
  const runAt = new Date(intent.runAt);
  return tx.scheduledAction.create({
    data: {
      eventId: scope.eventId,
      type: 'setting.apply',
      createdByPersonId: input.personId,
      runAt,
      scheduledFor: runAt,
      createdAt: input.now,
      payload: {
        scope: intent.target.scope,
        scopeId: intent.target.scope === 'event' ? scope.eventId : intent.target.stationId,
        key: intent.key,
        value: intent.value,
        expectedVersion: intent.expectedVersion,
        reason: intent.reason,
      },
    },
  });
}
export function findCaptureSchedule(tx: PrismaTransactionClient, scope: EventScope, id: string) {
  return tx.scheduledAction.findFirst({
    where: { eventId: scope.eventId, id, type: 'setting.apply', recurrence: null },
  });
}
export type CaptureScheduleRow = NonNullable<Awaited<ReturnType<typeof findCaptureSchedule>>>;

/** The immutable creation audit survives later schedule edits and worker outcomes. */
export function findCaptureCreationAudit(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { id: string; personId: string },
) {
  return tx.auditLog.findFirst({
    where: {
      eventId: scope.eventId,
      entityType: 'ScheduledAction',
      entityId: input.id,
      action: 'schedule.create',
      source: 'USER',
      actorId: input.personId,
    },
    select: { after: true },
  });
}
