import { z } from 'zod';
import { EventStatus } from '../event/index.js';
import { Id, IdempotencyKey, IsoDateTime, ReasonText } from '../common/index.js';

/**
 * Timed lifecycle changes and daily report snapshots (P10.8). Each records the lifecycle
 * version it was reviewed against; a change before it runs refuses the action rather than
 * applying a transition nobody reviewed. Go-live overrides are deliberately absent: an
 * override is a judgement made at the moment of go-live, not hours ahead of it.
 */
export const CreateLifecycleScheduleRequest = z
  .object({
    to: EventStatus,
    expectedVersion: z.number().int().nonnegative(),
    reason: ReasonText.optional(),
    runAt: IsoDateTime,
    idempotencyKey: IdempotencyKey,
  })
  .strict();
export type CreateLifecycleScheduleRequest = z.infer<typeof CreateLifecycleScheduleRequest>;

export const CreateReportScheduleRequest = z
  .object({
    eventDayId: Id,
    includeRehearsal: z.boolean().default(false),
    runAt: IsoDateTime,
    idempotencyKey: IdempotencyKey,
  })
  .strict();
export type CreateReportScheduleRequest = z.infer<typeof CreateReportScheduleRequest>;

/** Only a pending lifecycle or report schedule, at the version the canceller saw. */
export const CancelScheduleRequest = z
  .object({ expectedVersion: z.number().int().positive(), idempotencyKey: IdempotencyKey })
  .strict();
export type CancelScheduleRequest = z.infer<typeof CancelScheduleRequest>;

export const ScheduleParams = z.object({ id: Id }).strict();
export type ScheduleParams = z.infer<typeof ScheduleParams>;
