import { CategoryScheduleCreationIntent, type CreateCategoryScheduleRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { IdempotencyKeyReuseError } from '../../../platform/errors/index.js';
import { findCategorySchedule } from '../data/categoryScheduleRepo.js';
import { readCategoryAuthority, type CategoryScheduleActor } from './categoryAuthority.js';
import { categoryScheduleResponse } from './categoryScheduleResponse.js';
import { requireCategorySchedule } from './requireCategorySchedule.js';

export function readCategorySchedule(
  input: { categoryId: string; id: string; request?: CreateCategoryScheduleRequest },
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
      if (input.request) {
        const { idempotencyKey: _key, ...review } = input.request;
        const intent = CategoryScheduleCreationIntent.parse({
          ...review,
          categoryId: input.categoryId,
        });
        if (
          supported.row.createdByPersonId !== actor.volunteerId ||
          JSON.stringify(intent) !== JSON.stringify(supported.original)
        )
          throw new IdempotencyKeyReuseError();
      }
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
