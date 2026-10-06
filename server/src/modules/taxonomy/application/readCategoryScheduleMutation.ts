import { z } from 'zod';
import { CancelCategoryScheduleRequest, type UpdateCategoryScheduleRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { IdempotencyKeyReuseError, NotFoundError } from '../../../platform/errors/index.js';
import { categoryScheduleMutationAudits } from '../data/categoryScheduleAuditRepo.js';
import { findCategorySchedule } from '../data/categoryScheduleRepo.js';
import { CategoryScheduleEditAudit } from '../domain/categoryScheduleProvenance.js';
import { readCategoryAuthority, type CategoryScheduleActor } from './categoryAuthority.js';
import { categoryScheduleResponse } from './categoryScheduleResponse.js';
import { requireCategorySchedule } from './requireCategorySchedule.js';

const CancelAudit = z
  .object({
    version: z.number().int().positive(),
    status: z.literal('CANCELLED'),
    request: CancelCategoryScheduleRequest.omit({ idempotencyKey: true }),
  })
  .strict();
type MutationRequest = UpdateCategoryScheduleRequest | CancelCategoryScheduleRequest;
type MutationAction = 'schedule.update' | 'schedule.cancel';

function requireMatchingMutation(input: {
  action: MutationAction;
  original: unknown;
  request: MutationRequest;
}) {
  const { idempotencyKey: _key, ...request } = input.request;
  const original =
    input.action === 'schedule.update'
      ? CategoryScheduleEditAudit.safeParse(input.original)
      : CancelAudit.safeParse(input.original);
  if (!original.success) throw new NotFoundError('Category schedule mutation');
  if (JSON.stringify(original.data.request) !== JSON.stringify(request))
    throw new IdempotencyKeyReuseError();
}
export function readCategoryScheduleMutation(
  input: {
    categoryId: string;
    id: string;
    mutationVersion: number;
    action: MutationAction;
    request: MutationRequest;
  },
  actor: CategoryScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const event = await readCategoryAuthority(tx, actor);
      const supported = await requireCategorySchedule(tx, {
        scope: actor.scope,
        ...input,
        row: await findCategorySchedule(actor.scope, { tx, ...input }),
      });
      const audits = await categoryScheduleMutationAudits(actor.scope, {
        tx,
        id: input.id,
        personId: actor.volunteerId,
        action: input.action,
        version: input.mutationVersion,
      });
      if (audits.length !== 1) throw new NotFoundError('Category schedule mutation');
      requireMatchingMutation({
        action: input.action,
        original: audits[0]!.after,
        request: input.request,
      });
      return categoryScheduleResponse(tx, {
        row: supported.row,
        categoryId: input.categoryId,
        eventStatus: event.status,
        actor,
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
