import { z } from 'zod';
import { IdempotencyKey, IsoDateTime, ReasonText, collection } from '../common/index.js';
import { ScheduleTimelineQuery } from '../schedule/index.js';
import { ScopedSettingsReadQuery, ScopedSettingsTarget } from './scopedRead.js';
import {
  CaptureScheduleDefinition,
  CaptureScheduleRecord,
  ScheduledOperationalSettingKey,
} from './captureSchedule.js';

/** The target/key remain fixed; editing reviews both independently changing versions. */
export const UpdateCaptureScheduleRequest = CaptureScheduleDefinition.omit({
  target: true,
  key: true,
})
  .extend({ expectedScheduleVersion: z.number().int().positive(), idempotencyKey: IdempotencyKey })
  .strict();
export type UpdateCaptureScheduleRequest = z.infer<typeof UpdateCaptureScheduleRequest>;
export const CancelCaptureScheduleRequest = z
  .object({
    expectedScheduleVersion: z.number().int().positive(),
    reason: ReasonText,
    idempotencyKey: IdempotencyKey,
  })
  .strict();
export type CancelCaptureScheduleRequest = z.infer<typeof CancelCaptureScheduleRequest>;

export const CaptureScheduleListQuery = ScopedSettingsReadQuery.safeExtend({
  ...ScheduleTimelineQuery.shape,
  key: ScheduledOperationalSettingKey.default('capture.open'),
}).strict();
export type CaptureScheduleListQuery = z.infer<typeof CaptureScheduleListQuery>;
export const CaptureScheduleListResponse = collection(CaptureScheduleRecord)
  .extend({
    eventId: z.string().min(1).max(64),
    target: ScopedSettingsTarget,
    key: ScheduledOperationalSettingKey,
    evaluatedAt: IsoDateTime,
    data: z.array(CaptureScheduleRecord).max(200),
  })
  .strict()
  .refine(
    (response) =>
      response.meta.count === response.data.length &&
      new Set(response.data.map(({ id }) => id)).size === response.data.length &&
      response.data.every(
        (row) =>
          row.eventId === response.eventId &&
          row.key === response.key &&
          JSON.stringify(row.target) === JSON.stringify(response.target),
      ),
  );
export type CaptureScheduleListResponse = z.infer<typeof CaptureScheduleListResponse>;
