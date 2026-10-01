import { z } from 'zod';
import { GENERATED_SETTING_SCHEMAS as settings } from '../../generated/settings/index.js';
import { Id, IsoDateTime } from '../common/index.js';

/**
 * Runtime settings.
 *
 * Everything here used to be a constant compiled into the server: the shift
 * block boundaries in `platform/time`, the fifteen-minute silence threshold, the
 * implausible-tap rate, the welfare cutoff, the retention windows. Each one is a
 * number somebody wants to change during a dry run — and the shift boundaries in
 * particular decide whether a capture screen works at all, because station
 * scoping requires a block to be running.
 *
 * Changing a value in a redeploy is not the same as changing it at 09:15 on the
 * morning of a rehearsal, so they are stored, versioned by the audit log, and
 * served to both the server and the client from one place.
 *
 * Defaults come from the server registry's generated contracts and every field is optional on
 * the way in, so an empty settings table is a working system and a partial
 * update only touches what it names.
 */

/** Wall-clock time in the event's timezone, `HH:MM` on a 24-hour clock. */
export const WallClockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM on a 24-hour clock');
export type WallClockTime = z.infer<typeof WallClockTime>;

export const RuntimeSettings = z
  .object({
    eventName: settings.eventName,
    silentStationMinutes: settings.silentStationMinutes,
    staleDeviceMinutes: settings.staleDeviceMinutes,
    implausibleTapsPerMinute: settings.implausibleTapsPerMinute,
    longShiftMinutes: settings.longShiftMinutes,
    lostPersonPurgeHours: settings.lostPersonPurgeHours,
    idempotencyRetentionDays: settings.idempotencyRetentionDays,
    refreshSessionDays: settings.refreshSessionDays,
    dashboardPollSeconds: settings.dashboardPollSeconds,
    alertPollSeconds: settings.alertPollSeconds,
    captureUndoWindowSeconds: settings.captureUndoWindowSeconds,
    captureSendGraceSeconds: settings.captureSendGraceSeconds,
    outboxWarningCount: settings.outboxWarningCount,
    outboxWarningAgeMinutes: settings.outboxWarningAgeMinutes,
  })
  .strict();
export type RuntimeSettings = z.infer<typeof RuntimeSettings>;

/** A patch. Every key optional; absent keys are left alone. */
export const UpdateSettingsRequest = RuntimeSettings.partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one setting to change',
  });
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequest>;

export const SettingsResponse = z
  .object({
    settings: RuntimeSettings,
    /**
     * Which keys are stored rather than falling back to a compiled default.
     * The admin screen renders an overridden value differently, because "this
     * was changed by somebody" and "this is the default" are different facts.
     */
    overriddenKeys: z.array(z.string()),
    updatedAt: IsoDateTime.nullable(),
    updatedById: Id.nullable(),
    updatedByName: z.string().nullable(),
  })
  .strict();
export type SettingsResponse = z.infer<typeof SettingsResponse>;
