import type { CategoryScheduleCreationIntent } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { lockReserved } from '../../../platform/idempotency/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { lockCategoryAuthority, type CategoryScheduleActor } from './categoryAuthority.js';
import { requireCategoryActivity } from './requireCategoryActivity.js';
import { reviewCategorySchedule } from './reviewCategorySchedule.js';

export async function prepareCategorySchedule(
  tx: PrismaTransactionClient,
  input: {
    intent: CategoryScheduleCreationIntent;
    actor: CategoryScheduleActor;
    idempotencyKey: string;
  },
) {
  const event = await lockCategoryAuthority(tx, input.actor);
  const category = await requireCategoryActivity(tx, {
    scope: input.actor.scope,
    categoryId: input.intent.categoryId,
  });
  await lockReserved(tx, input.actor.scope, input.idempotencyKey);
  const now = (input.actor.clock ?? systemClock).now();
  reviewCategorySchedule({ intent: input.intent, category, now });
  return { event, category, now };
}
