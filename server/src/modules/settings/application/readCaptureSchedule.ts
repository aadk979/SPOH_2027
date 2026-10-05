import { CaptureScheduleIntent, type CreateCaptureScheduleRequest } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { IdempotencyKeyReuseError, NotFoundError } from '../../../platform/errors/index.js';
import { findCaptureCreationAudit, findCaptureSchedule } from '../data/captureScheduleRepo.js';
import { captureScheduleResponse } from './captureScheduleResponse.js';
import type { CaptureScheduleActor } from './prepareCaptureSchedule.js';

/** A replay binds immutable creation intent, but always returns current status and values. */
export function readCaptureSchedule(
  input: { id: string; request?: CreateCaptureScheduleRequest },
  actor: CaptureScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const event = await holdCaptureEvent(tx, actor.scope);
      await requireCurrentCapability(tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'config.manage',
      });
      const row = await findCaptureSchedule(tx, actor.scope, input.id);
      if (!row || !row.createdByPersonId) throw new NotFoundError('Capture schedule');
      const audit = await findCaptureCreationAudit(tx, actor.scope, {
        id: row.id,
        personId: row.createdByPersonId,
      });
      const original = CaptureScheduleIntent.safeParse(audit?.after);
      if (!original.success) throw new NotFoundError('Capture schedule');
      if (input.request) {
        const { idempotencyKey: _key, ...intent } = input.request;
        if (
          row.createdByPersonId !== actor.volunteerId ||
          JSON.stringify(CaptureScheduleIntent.parse(intent)) !== JSON.stringify(original.data)
        )
          throw new IdempotencyKeyReuseError();
      }
      return captureScheduleResponse(tx, { row, actor, event });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
