import { CategoryScheduleResponse, type EventStatus } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { toCategorySchedule } from '../data/categoryScheduleMapper.js';
import type { CategoryScheduleRow } from '../data/categoryScheduleRepo.js';
import { categoryActivityResponse } from './categoryActivityResponse.js';
import type { CategoryScheduleActor } from './categoryAuthority.js';
import { requireCategoryActivity } from './requireCategoryActivity.js';
import { requireCategorySchedule } from './requireCategorySchedule.js';

export async function categoryScheduleResponse(
  tx: PrismaTransactionClient,
  input: {
    row: CategoryScheduleRow;
    categoryId: string;
    eventStatus: EventStatus;
    actor: CategoryScheduleActor;
  },
) {
  const { actor } = input;
  const supported = await requireCategorySchedule(tx, {
    scope: actor.scope,
    row: input.row,
    categoryId: input.categoryId,
  });
  const category = await requireCategoryActivity(tx, {
    scope: actor.scope,
    categoryId: input.categoryId,
  });
  const schedule = toCategorySchedule(input.row, {
    personId: actor.volunteerId,
    audits: supported.audits,
  });
  if (!schedule) throw new NotFoundError('Category schedule');
  return CategoryScheduleResponse.parse({
    schedule,
    current: categoryActivityResponse({
      eventId: actor.scope.eventId,
      eventStatus: input.eventStatus,
      category,
      now: (actor.clock ?? systemClock).now(),
    }),
  });
}
