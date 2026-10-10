import { z } from 'zod';
import { IdempotencyKey, IsoDateTime } from '../common/index.js';
import { ScheduleTimelineRecord } from '../schedule/index.js';
import {
  ScopedSettingsReadResponse,
  ScopedSettingsTarget,
  ScopedOperationalSettingKey,
} from './scopedRead.js';
import {
  GENERATED_SETTING_METADATA as metadata,
  GENERATED_SETTING_SCHEMAS as schemas,
} from '../../generated/settings/index.js';

export const ScheduledOperationalSettingKey = ScopedOperationalSettingKey.refine(
  (key) => metadata[key].schedulable,
  { message: 'This setting cannot be scheduled' },
);
export type ScheduledOperationalSettingKey = z.infer<typeof ScheduledOperationalSettingKey>;
export const ScheduledOperationalValue = z.union([
  z.number(),
  z.boolean(),
  z.string(),
  z.array(z.string()),
]);

export function validateOperationalSchedule(
  input: {
    key: ScheduledOperationalSettingKey;
    value: unknown;
    target: { scope: 'event' | 'station' };
  },
  ctx: z.RefinementCtx,
) {
  const scopes: readonly string[] = metadata[input.key].scopes;
  if (!scopes.includes(input.target.scope))
    ctx.addIssue({
      code: 'custom',
      path: ['target'],
      message: 'This setting does not support the selected scope',
    });
  if (!schemas[input.key].safeParse(input.value).success)
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Invalid scheduled setting value' });
}

/** The generated operational catalogue supplies scope and value validation. */
export const CaptureScheduleDefinition = z
  .object({
    target: ScopedSettingsTarget,
    key: ScheduledOperationalSettingKey,
    value: ScheduledOperationalValue,
    expectedVersion: z.number().int().nonnegative(),
    reason: z.string().trim().min(3).max(500),
    runAt: IsoDateTime.transform((instant) => new Date(instant).toISOString()),
  })
  .strict();
export const CaptureScheduleIntent = CaptureScheduleDefinition.superRefine(
  validateOperationalSchedule,
);
export type CaptureScheduleIntent = z.infer<typeof CaptureScheduleIntent>;

export const CreateCaptureScheduleRequest = CaptureScheduleIntent.safeExtend({
  idempotencyKey: IdempotencyKey,
}).strict();
export type CreateCaptureScheduleRequest = z.infer<typeof CreateCaptureScheduleRequest>;

export const CaptureScheduleRecord = ScheduleTimelineRecord.extend({
  kind: z.literal('SETTING'),
  recurring: z.literal(false),
  target: ScopedSettingsTarget,
  key: ScheduledOperationalSettingKey,
  value: ScheduledOperationalValue,
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(500),
})
  .strict()
  .superRefine(validateOperationalSchedule);
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
