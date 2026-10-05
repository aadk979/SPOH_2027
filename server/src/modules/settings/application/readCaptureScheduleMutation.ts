import { z } from 'zod';
import { CancelCaptureScheduleRequest, UpdateCaptureScheduleRequest } from '@spoh/shared';
import { requireCurrentCapability } from '../../../platform/access/currentCapability.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { IdempotencyKeyReuseError, NotFoundError } from '../../../platform/errors/index.js';
import {
  findCaptureMutationAudit,
  type CaptureMutationAction,
  type CaptureMutationRequest,
} from '../data/captureScheduleMutationRepo.js';
import { findCaptureSchedule } from '../data/captureScheduleRepo.js';
import { captureScheduleResponse } from './captureScheduleResponse.js';
import type { CaptureScheduleActor } from './prepareCaptureSchedule.js';
import { requireCaptureSchedule } from './requireCaptureSchedule.js';

const EditAudit = z
  .object({
    version: z.number().int().positive(),
    request: UpdateCaptureScheduleRequest.omit({ idempotencyKey: true }),
  })
  .strict();
const CancelAudit = z
  .object({
    version: z.number().int().positive(),
    status: z.literal('CANCELLED'),
    request: CancelCaptureScheduleRequest.omit({ idempotencyKey: true }),
  })
  .strict();
function requireMatchingMutation(
  action: CaptureMutationAction,
  input: { original: unknown; request: CaptureMutationRequest },
) {
  const { idempotencyKey: _key, ...request } = input.request;
  const original =
    action === 'schedule.update'
      ? EditAudit.safeParse(input.original)
      : CancelAudit.safeParse(input.original);
  if (!original.success) throw new NotFoundError('Capture schedule mutation');
  if (JSON.stringify(original.data.request) !== JSON.stringify(request))
    throw new IdempotencyKeyReuseError();
}
/** Historical receipt binds the original operation; current authority/status/values are read afresh. */
export function readCaptureScheduleMutation(
  input: {
    id: string;
    mutationVersion: number;
    action: CaptureMutationAction;
    request: CaptureMutationRequest;
  },
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
      const { row } = await requireCaptureSchedule(tx, {
        scope: actor.scope,
        row: await findCaptureSchedule(tx, actor.scope, input.id),
      });
      const audit = await findCaptureMutationAudit(tx, actor.scope, {
        id: input.id,
        personId: actor.volunteerId,
        action: input.action,
        version: input.mutationVersion,
      });
      requireMatchingMutation(input.action, { original: audit?.after, request: input.request });
      return captureScheduleResponse(tx, { row, event, actor });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
