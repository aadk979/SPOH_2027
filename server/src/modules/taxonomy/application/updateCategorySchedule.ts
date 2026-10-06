import { CategoryScheduleCreationIntent, type UpdateCategoryScheduleRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { editCategorySchedule } from '../data/categoryScheduleMutationRepo.js';
import type { CategoryScheduleRow } from '../data/categoryScheduleRepo.js';
import type { CategoryScheduleActor } from './categoryAuthority.js';
import { finishCategoryScheduleMutation } from './finishCategoryScheduleMutation.js';
import { lockPendingCategorySchedule } from './lockPendingCategorySchedule.js';
import { reviewCategorySchedule } from './reviewCategorySchedule.js';

async function recordCategoryScheduleEdit(
  tx: PrismaTransactionClient,
  input: {
    actor: CategoryScheduleActor;
    row: CategoryScheduleRow;
    before: { version: number; intent: CategoryScheduleCreationIntent };
    intent: CategoryScheduleCreationIntent;
    request: Omit<UpdateCategoryScheduleRequest, 'idempotencyKey'>;
  },
) {
  await writeAudit(tx, {
    ...input.actor.audit,
    source: 'USER',
    action: 'schedule.update',
    entityType: 'ScheduledAction',
    entityId: input.row.id,
    before: input.before,
    after: { version: input.row.version, intent: input.intent, request: input.request },
  });
}

export function updateCategorySchedule(
  input: { categoryId: string; id: string; request: UpdateCategoryScheduleRequest },
  actor: CategoryScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const prepared = await lockPendingCategorySchedule(tx, {
        categoryId: input.categoryId,
        id: input.id,
        ...input.request,
        actor,
      });
      if (prepared.row.createdByPersonId !== actor.volunteerId)
        throw new NotFoundError('Owned category schedule');
      const { idempotencyKey, ...request } = input.request;
      const { expectedScheduleVersion: _version, ...review } = request;
      const intent = CategoryScheduleCreationIntent.parse({
        ...review,
        categoryId: input.categoryId,
      });
      reviewCategorySchedule({ intent, category: prepared.category, now: prepared.now });
      const row = await editCategorySchedule(actor.scope, {
        tx,
        id: input.id,
        version: prepared.row.version,
        intent,
      });
      await recordCategoryScheduleEdit(tx, {
        actor,
        row,
        before: { version: prepared.row.version, intent: prepared.definition.intent },
        intent,
        request,
      });
      return finishCategoryScheduleMutation(tx, {
        row,
        categoryId: input.categoryId,
        eventStatus: prepared.event.status,
        actor,
        now: prepared.now,
        idempotencyKey,
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
