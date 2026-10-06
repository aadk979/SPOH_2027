import { prisma } from '../../../platform/db/client.js';
import { systemClock } from '../../../platform/time/index.js';
import { categoryActivityResponse } from './categoryActivityResponse.js';
import { readCategoryAuthority, type CategoryScheduleActor } from './categoryAuthority.js';
import { requireCategoryActivity } from './requireCategoryActivity.js';

export function readCategory(input: { categoryId: string }, actor: CategoryScheduleActor) {
  return prisma.$transaction(
    async (tx) => {
      const event = await readCategoryAuthority(tx, actor);
      const category = await requireCategoryActivity(tx, { scope: actor.scope, ...input });
      return categoryActivityResponse({
        eventId: actor.scope.eventId,
        eventStatus: event.status,
        category,
        now: (actor.clock ?? systemClock).now(),
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
