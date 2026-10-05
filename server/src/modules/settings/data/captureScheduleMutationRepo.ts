import type {
  CaptureScheduleIntent,
  CancelCaptureScheduleRequest,
  UpdateCaptureScheduleRequest,
} from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { findCaptureSchedule } from './captureScheduleRepo.js';

export async function lockCaptureSchedule(
  tx: PrismaTransactionClient,
  scope: EventScope,
  id: string,
) {
  await tx.$queryRaw`SELECT id FROM "ScheduledAction" WHERE "eventId" = ${scope.eventId} AND id = ${id} FOR UPDATE`;
  return findCaptureSchedule(tx, scope, id);
}
export function editCaptureSchedule(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { id: string; version: number; intent: CaptureScheduleIntent },
) {
  const { intent } = input;
  const runAt = new Date(intent.runAt);
  return tx.scheduledAction.update({
    where: { eventId: scope.eventId, id: input.id, version: input.version, status: 'PENDING' },
    data: {
      runAt,
      scheduledFor: runAt,
      version: { increment: 1 },
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
export function cancelCaptureScheduleRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { id: string; version: number; now: Date },
) {
  return tx.scheduledAction.update({
    where: { eventId: scope.eventId, id: input.id, version: input.version, status: 'PENDING' },
    data: {
      status: 'CANCELLED',
      completedAt: input.now,
      lockedBy: null,
      lockedUntil: null,
      version: { increment: 1 },
    },
  });
}
export type CaptureMutationRequest = UpdateCaptureScheduleRequest | CancelCaptureScheduleRequest;
export type CaptureMutationAction = 'schedule.update' | 'schedule.cancel';
export function findCaptureMutationAudit(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { id: string; personId: string; action: CaptureMutationAction; version: number },
) {
  return tx.auditLog.findFirst({
    where: {
      eventId: scope.eventId,
      entityType: 'ScheduledAction',
      entityId: input.id,
      actorId: input.personId,
      source: 'USER',
      action: input.action,
      after: { path: ['version'], equals: input.version },
    },
    select: { after: true },
  });
}
