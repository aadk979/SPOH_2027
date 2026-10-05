import { z } from 'zod';
import { IdempotencyKey, IsoDateTime } from '../common/index.js';
import { ScheduleTimelineRecord } from '../schedule/index.js';
import { ScopedSettingsReadResponse, ScopedSettingsTarget } from './scopedRead.js';

/** Only the verified capture consumer can be scheduled through this boundary. */
export const CaptureScheduleIntent = z
  .object({
    target: ScopedSettingsTarget,
    key: z.literal('capture.open'),
    value: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(500),
    runAt: IsoDateTime.transform((instant) => new Date(instant).toISOString()),
  })
  .strict();
export type CaptureScheduleIntent = z.infer<typeof CaptureScheduleIntent>;

export const CreateCaptureScheduleRequest = CaptureScheduleIntent.extend({
  idempotencyKey: IdempotencyKey,
}).strict();
export type CreateCaptureScheduleRequest = z.infer<typeof CreateCaptureScheduleRequest>;

export const CaptureScheduleRecord = ScheduleTimelineRecord.extend({
  kind: z.literal('SETTING'),
  recurring: z.literal(false),
  target: ScopedSettingsTarget,
  key: z.literal('capture.open'),
  value: z.boolean(),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(500),
}).strict();
export type CaptureScheduleRecord = z.infer<typeof CaptureScheduleRecord>;

export const CaptureScheduleResponse = z
  .object({
    schedule: CaptureScheduleRecord,
    current: ScopedSettingsReadResponse,
  })
  .strict()
  .refine(
    ({ schedule, current }) =>
      schedule.eventId === current.eventId &&
      JSON.stringify(schedule.target) === JSON.stringify(current.target),
    { message: 'Schedule and current settings must belong to the same event and target' },
  );
export type CaptureScheduleResponse = z.infer<typeof CaptureScheduleResponse>;
