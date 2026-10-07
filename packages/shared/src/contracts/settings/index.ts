import { z } from 'zod';
import { GENERATED_SETTING_SCHEMAS as settings } from '../../generated/settings/index.js';

/** Wall-clock time in the event's timezone, `HH:MM` on a 24-hour clock. */
export const WallClockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM on a 24-hour clock');
export type WallClockTime = z.infer<typeof WallClockTime>;

/**
 * What a signed-in device needs to behave like the server: its poll intervals,
 * the undo window, the send grace period and the outbox warning thresholds, for
 * the caller's own event. Client-visible tuning only; no actor, history or
 * override metadata. GET /admin/settings/client.
 */
export const ClientSettings = z
  .object({
    dashboardPollSeconds: settings.dashboardPollSeconds,
    alertPollSeconds: settings.alertPollSeconds,
    captureUndoWindowSeconds: settings.captureUndoWindowSeconds,
    captureSendGraceSeconds: settings.captureSendGraceSeconds,
    outboxWarningCount: settings.outboxWarningCount,
    outboxWarningAgeMinutes: settings.outboxWarningAgeMinutes,
  })
  .strict();
export type ClientSettings = z.infer<typeof ClientSettings>;

export const ClientSettingsResponse = z.object({ settings: ClientSettings }).strict();
export type ClientSettingsResponse = z.infer<typeof ClientSettingsResponse>;
