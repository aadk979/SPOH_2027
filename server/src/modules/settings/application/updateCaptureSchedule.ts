import type { UpdateCaptureScheduleRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { settleReserved } from '../../../platform/idempotency/index.js';
import { fixedClock } from '../../../platform/time/index.js';
import { editCaptureSchedule } from '../data/captureScheduleMutationRepo.js';
import { captureScheduleResponse } from './captureScheduleResponse.js';
import { lockPendingCaptureSchedule } from './lockPendingCaptureSchedule.js';
import type { CaptureScheduleActor } from './prepareCaptureSchedule.js';
import { reviewCaptureScheduleIntent } from './reviewCaptureScheduleIntent.js';
import { lockEventSettingAuthority } from './lockEventSettingAuthority.js';
import { parseUpdatedScheduleIntent } from './parseUpdatedScheduleIntent.js';

/** Keeping the creator preserves the worker's current-authority attribution after edits. */
export function updateCaptureSchedule(
  input: { id: string; request: UpdateCaptureScheduleRequest },
  actor: CaptureScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const prepared = await lockPendingCaptureSchedule(tx, {
        id: input.id,
        ...input.request,
        actor,
      });
      if (prepared.row.createdByPersonId !== actor.volunteerId)
        throw new NotFoundError('Capture schedule');
      const { idempotencyKey, ...request } = input.request;
      const { expectedScheduleVersion: _review, ...definition } = request;
      const intent = parseUpdatedScheduleIntent({
        ...definition,
        target: prepared.intent.target,
        key: prepared.intent.key,
      });
      await lockEventSettingAuthority(tx, actor, intent.key);
      await reviewCaptureScheduleIntent(tx, { scope: actor.scope, intent, now: prepared.now });
      const row = await editCaptureSchedule(tx, actor.scope, {
        id: input.id,
        version: prepared.row.version,
        intent,
      });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'schedule.update',
        entityType: 'ScheduledAction',
        entityId: row.id,
        before: { version: prepared.row.version, intent: prepared.intent },
        after: { version: row.version, request },
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
