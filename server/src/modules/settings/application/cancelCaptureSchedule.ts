import type { CancelCaptureScheduleRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { settleReserved } from '../../../platform/idempotency/index.js';
import { fixedClock } from '../../../platform/time/index.js';
import { cancelCaptureScheduleRow } from '../data/captureScheduleMutationRepo.js';
import { captureScheduleResponse } from './captureScheduleResponse.js';
import { lockPendingCaptureSchedule } from './lockPendingCaptureSchedule.js';
import type { CaptureScheduleActor } from './prepareCaptureSchedule.js';

/** Any current configuration manager may stop a pending effect, without executing it. */
export function cancelCaptureSchedule(
  input: { id: string; request: CancelCaptureScheduleRequest },
  actor: CaptureScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const prepared = await lockPendingCaptureSchedule(tx, {
        id: input.id,
        ...input.request,
        actor,
      });
      const { idempotencyKey, ...request } = input.request;
      const row = await cancelCaptureScheduleRow(tx, actor.scope, {
        id: input.id,
        version: prepared.row.version,
        now: prepared.now,
      });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'schedule.cancel',
        entityType: 'ScheduledAction',
        entityId: row.id,
        before: { version: prepared.row.version, status: prepared.row.status },
        after: { version: row.version, status: row.status, request },
      });
      await settleReserved(tx, actor.scope, {
        key: idempotencyKey,
        statusCode: 200,
        body: { scheduledActionId: row.id, mutationVersion: row.version },
      });
      return captureScheduleResponse(tx, {
        row,
        event: prepared.event,
        actor: { ...actor, clock: fixedClock(prepared.now) },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
