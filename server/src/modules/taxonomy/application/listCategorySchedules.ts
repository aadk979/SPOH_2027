import { CategoryScheduleListResponse, type CategoryScheduleListQuery } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { toPage } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { categoryScheduleDefinitions } from '../data/categoryScheduleAuditRepo.js';
import { categoryScheduleCursor, categoryScheduleRows } from '../data/categoryScheduleListRepo.js';
import { toCategorySchedule } from '../data/categoryScheduleMapper.js';
import { readCategoryAuthority, type CategoryScheduleActor } from './categoryAuthority.js';
import { requireCategoryActivity } from './requireCategoryActivity.js';

export function listCategorySchedules(
  input: { categoryId: string; query: CategoryScheduleListQuery },
  actor: CategoryScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      await readCategoryAuthority(tx, actor);
      await requireCategoryActivity(tx, { scope: actor.scope, categoryId: input.categoryId });
      const cursor = input.query.cursor
        ? await categoryScheduleCursor(actor.scope, {
            tx,
            categoryId: input.categoryId,
            id: input.query.cursor,
          })
        : null;
      if (input.query.cursor && !cursor) throw new NotFoundError('Category schedule cursor');
      const page = toPage(
        await categoryScheduleRows(actor.scope, { tx, ...input, cursor }),
        input.query.limit,
      );
      const audits = await categoryScheduleDefinitions(actor.scope, {
        tx,
        ids: page.data.map(({ id }) => id),
      });
      const data = page.data.flatMap((row) => {
        const record = toCategorySchedule(row, { personId: actor.volunteerId, audits });
        return record ? [record] : [];
      });
      return CategoryScheduleListResponse.parse({
        eventId: actor.scope.eventId,
        categoryId: input.categoryId,
        evaluatedAt: (actor.clock ?? systemClock).now().toISOString(),
        data,
        meta: { count: data.length, nextCursor: page.nextCursor },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
