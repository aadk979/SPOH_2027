import { CaptureScheduleIntent, type CreateCaptureScheduleRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { IdempotencyKeyReuseError } from '../../../platform/errors/index.js';
import { findCaptureSchedule } from '../data/captureScheduleRepo.js';
import { captureScheduleResponse } from './captureScheduleResponse.js';
import type { CaptureScheduleActor } from './prepareCaptureSchedule.js';
import { requireCaptureSchedule } from './requireCaptureSchedule.js';

/** A replay binds immutable creation intent, but always returns current status and values. */
export function readCaptureSchedule(
  input: { id: string; request?: CreateCaptureScheduleRequest },
  actor: CaptureScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const event = await holdCaptureEvent(tx, actor.scope);
      await requireCurrentPermission(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        action: 'Settings.Read',
      });
      const { row, original } = await requireCaptureSchedule(tx, {
        scope: actor.scope,
        row: await findCaptureSchedule(tx, actor.scope, input.id),
      });
      if (input.request) {
        const { idempotencyKey: _key, ...intent } = input.request;
        if (
          row.createdByPersonId !== actor.volunteerId ||
          JSON.stringify(CaptureScheduleIntent.parse(intent)) !==
            JSON.stringify(CaptureScheduleIntent.parse(original))
        )
          throw new IdempotencyKeyReuseError();
      }
      return captureScheduleResponse(tx, { row, actor, event });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
