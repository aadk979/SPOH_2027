import { CaptureScheduleIntent, type CreateCaptureScheduleRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { settleReserved } from '../../../platform/idempotency/index.js';
import { fixedClock } from '../../../platform/time/index.js';
import { insertCaptureSchedule } from '../data/captureScheduleRepo.js';
import { captureSettingPayload } from '../jobs.js';
import { captureScheduleResponse } from './captureScheduleResponse.js';
import { prepareCaptureSchedule, type CaptureScheduleActor } from './prepareCaptureSchedule.js';

/** Enqueueing changes no setting; action, attributed audit and id-only receipt commit together. */
export function createCaptureSchedule(
  request: CreateCaptureScheduleRequest,
  actor: CaptureScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const intent = CaptureScheduleIntent.parse({
        target: request.target,
        key: request.key,
        value: request.value,
        expectedVersion: request.expectedVersion,
        reason: request.reason,
        runAt: request.runAt,
      });
      const { event, now } = await prepareCaptureSchedule(tx, {
        intent,
        actor,
        idempotencyKey: request.idempotencyKey,
      });
      const row = await insertCaptureSchedule(tx, actor.scope, {
        intent,
        personId: actor.volunteerId,
        now,
      });
      captureSettingPayload.parse(row.payload);
      await writeAudit(tx, {
        ...actor.audit,
        action: 'schedule.create',
        entityType: 'ScheduledAction',
        entityId: row.id,
        after: intent,
      });
      await settleReserved(tx, actor.scope, {
        key: request.idempotencyKey,
        statusCode: 201,
        body: { scheduledActionId: row.id },
      });
      return captureScheduleResponse(tx, {
        row,
        event,
        actor: { ...actor, clock: fixedClock(now) },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
