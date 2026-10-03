import { z } from 'zod';
import { ScheduledActionStatus } from '../../invariants/enums.js';
import { Id, IsoDateTime, PaginationQuery, collection } from '../common/index.js';

/** Only bounded operational codes cross the wire; raw worker errors remain private. */
export const ScheduleError = z.enum([
  'INVALID_PAYLOAD',
  'AUTHORITY_CHANGED',
  'GUARD_FAILED',
  'TOO_LATE',
  'TARGET_MISSING',
  'SYSTEM_ONLY',
  'HANDLER_UNAVAILABLE',
  'EXECUTION_FAILED',
  'ATTEMPTS_EXHAUSTED',
]);
export type ScheduleError = z.infer<typeof ScheduleError>;

/** Catalogue labels deliberately hide unknown stored handler names. */
export const ScheduleKind = z.enum([
  'LIFECYCLE',
  'ANNOUNCEMENT',
  'SETTING',
  'CAPTURE_CATEGORY',
  'REPORT',
  'LOST_PERSON_PURGE',
  'VISITOR_PURGE',
  'SESSION_PRUNE',
  'REPLAY_PRUNE',
  'OTHER',
]);
export type ScheduleKind = z.infer<typeof ScheduleKind>;

export const ScheduleTimelineQuery = PaginationQuery.extend({
  status: ScheduledActionStatus.optional(),
}).strict();
export type ScheduleTimelineQuery = z.infer<typeof ScheduleTimelineQuery>;

/** Metadata only: no payload, audience, actor identity, lease token or draft content. */
export const ScheduleTimelineRecord = z
  .object({
    id: Id,
    eventId: Id,
    kind: ScheduleKind,
    scheduledFor: IsoDateTime,
    runAt: IsoDateTime,
    status: ScheduledActionStatus,
    version: z.number().int().positive(),
    attempts: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive(),
    recurring: z.boolean(),
    createdByYou: z.boolean(),
    createdAt: IsoDateTime,
    completedAt: IsoDateTime.nullable(),
    lastError: ScheduleError.nullable(),
  })
  .strict();
export type ScheduleTimelineRecord = z.infer<typeof ScheduleTimelineRecord>;

export const ScheduleTimelineResponse = collection(ScheduleTimelineRecord)
  .extend({
    eventId: Id,
    evaluatedAt: IsoDateTime,
    data: z.array(ScheduleTimelineRecord).max(200),
  })
  .strict()
  .refine(
    (response) =>
      response.meta.count === response.data.length &&
      response.data.every((row) => row.eventId === response.eventId) &&
      new Set(response.data.map(({ id }) => id)).size === response.data.length,
  );
export type ScheduleTimelineResponse = z.infer<typeof ScheduleTimelineResponse>;
