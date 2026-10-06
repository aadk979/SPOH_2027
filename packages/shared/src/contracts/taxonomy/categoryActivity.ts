import { z } from 'zod';
import { EventStatus } from '../event/index.js';
import { Id, IsoDateTime, PaginationQuery, collection } from '../common/index.js';
import { CategoryCode } from '../registration/index.js';

/** Private configuration reads include inactive categories so their activity can be restored. */
export const CategoryActivityRecord = z
  .object({
    id: Id,
    code: CategoryCode,
    label: z.string(),
    sortOrder: z.number().int(),
    active: z.boolean(),
    updatedAt: IsoDateTime,
  })
  .strict();
export type CategoryActivityRecord = z.infer<typeof CategoryActivityRecord>;

export const CategoryActivityParams = z.object({ categoryId: Id }).strict();
export type CategoryActivityParams = z.infer<typeof CategoryActivityParams>;
export const CategoryActivityListQuery = PaginationQuery;
export type CategoryActivityListQuery = z.infer<typeof CategoryActivityListQuery>;

export const CategoryActivityResponse = z
  .object({
    eventId: Id,
    eventStatus: EventStatus,
    evaluatedAt: IsoDateTime,
    data: CategoryActivityRecord,
  })
  .strict();
export type CategoryActivityResponse = z.infer<typeof CategoryActivityResponse>;

export const CategoryActivityListResponse = collection(CategoryActivityRecord)
  .extend({
    eventId: Id,
    eventStatus: EventStatus,
    evaluatedAt: IsoDateTime,
    data: z.array(CategoryActivityRecord).max(200),
  })
  .strict()
  .refine(
    (response) =>
      response.meta.count === response.data.length &&
      new Set(response.data.map(({ id }) => id)).size === response.data.length,
  );
export type CategoryActivityListResponse = z.infer<typeof CategoryActivityListResponse>;
