import { CategoryActivityListResponse, type CategoryActivityListQuery } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { toPage } from '../../../platform/db/pagination.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { categoryActivityCursor, categoryActivityRows } from '../data/categoryReadRepo.js';
import { toCategoryActivity } from '../data/categoryScheduleMapper.js';
import { readCategoryAuthority, type CategoryScheduleActor } from './categoryAuthority.js';

export function readCategories(query: CategoryActivityListQuery, actor: CategoryScheduleActor) {
  return prisma.$transaction(
    async (tx) => {
      const event = await readCategoryAuthority(tx, actor);
      const cursor = query.cursor
        ? await categoryActivityCursor(actor.scope, { tx, id: query.cursor })
        : null;
      if (query.cursor && !cursor) throw new NotFoundError('Category cursor');
      const page = toPage(
        await categoryActivityRows(actor.scope, { tx, query, cursor }),
        query.limit,
      );
      return CategoryActivityListResponse.parse({
        eventId: actor.scope.eventId,
        eventStatus: event.status,
        evaluatedAt: (actor.clock ?? systemClock).now().toISOString(),
        data: page.data.map(toCategoryActivity),
        meta: { count: page.data.length, nextCursor: page.nextCursor },
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
