import { z } from 'zod';
import { Id, IdempotencyKey, IsoDateTime, ReasonText, collection } from '../common/index.js';
import { ScheduleTimelineQuery, ScheduleTimelineRecord } from '../schedule/index.js';
import { CategoryActivityResponse } from './categoryActivity.js';

const Instant = IsoDateTime.transform((instant) => new Date(instant).toISOString());

/** Review the current snapshot at submission; execution remains an absolute desired state. */
export const CategoryScheduleIntent = z
  .object({
    active: z.boolean(),
    expectedActive: z.boolean(),
    expectedUpdatedAt: Instant,
    reason: ReasonText,
    runAt: Instant,
  })
  .strict();
export type CategoryScheduleIntent = z.infer<typeof CategoryScheduleIntent>;
export const CategoryScheduleCreationIntent = CategoryScheduleIntent.extend({
  categoryId: Id,
}).strict();
export type CategoryScheduleCreationIntent = z.infer<typeof CategoryScheduleCreationIntent>;

export const CreateCategoryScheduleRequest = CategoryScheduleIntent.extend({
  idempotencyKey: IdempotencyKey,
}).strict();
export type CreateCategoryScheduleRequest = z.infer<typeof CreateCategoryScheduleRequest>;
export const UpdateCategoryScheduleRequest = CategoryScheduleIntent.extend({
  expectedScheduleVersion: z.number().int().positive(),
  idempotencyKey: IdempotencyKey,
}).strict();
export type UpdateCategoryScheduleRequest = z.infer<typeof UpdateCategoryScheduleRequest>;
export const CancelCategoryScheduleRequest = z
  .object({
    expectedScheduleVersion: z.number().int().positive(),
    reason: ReasonText,
    idempotencyKey: IdempotencyKey,
  })
  .strict();
export type CancelCategoryScheduleRequest = z.infer<typeof CancelCategoryScheduleRequest>;

export const CategoryScheduleParams = z.object({ categoryId: Id, id: Id }).strict();
export type CategoryScheduleParams = z.infer<typeof CategoryScheduleParams>;
export const CategoryScheduleListQuery = ScheduleTimelineQuery;
export type CategoryScheduleListQuery = z.infer<typeof CategoryScheduleListQuery>;

export const CategoryScheduleRecord = ScheduleTimelineRecord.extend({
  kind: z.literal('CAPTURE_CATEGORY'),
  recurring: z.literal(false),
  categoryId: Id,
  active: z.boolean(),
  expectedActive: z.boolean(),
  expectedUpdatedAt: IsoDateTime,
  reason: ReasonText,
}).strict();
export type CategoryScheduleRecord = z.infer<typeof CategoryScheduleRecord>;
export const CategoryScheduleResponse = z
  .object({ schedule: CategoryScheduleRecord, current: CategoryActivityResponse })
  .strict()
  .refine(
    ({ schedule, current }) =>
      schedule.eventId === current.eventId && schedule.categoryId === current.data.id,
    { message: 'Schedule and current category must belong to the same event and category' },
  );
export type CategoryScheduleResponse = z.infer<typeof CategoryScheduleResponse>;
export const CategoryScheduleListResponse = collection(CategoryScheduleRecord)
  .extend({
    eventId: Id,
    categoryId: Id,
    evaluatedAt: IsoDateTime,
    data: z.array(CategoryScheduleRecord).max(200),
  })
  .strict()
  .refine(
    (response) =>
      response.meta.count === response.data.length &&
      new Set(response.data.map(({ id }) => id)).size === response.data.length &&
      response.data.every(
        (row) => row.eventId === response.eventId && row.categoryId === response.categoryId,
      ),
  );
export type CategoryScheduleListResponse = z.infer<typeof CategoryScheduleListResponse>;
