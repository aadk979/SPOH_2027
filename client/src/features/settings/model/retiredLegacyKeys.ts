import type { RuntimeSettings } from '@spoh/shared';

/**
 * Settings now written only through the scoped settings catalogue. The legacy
 * endpoint refuses them, so this form shows where to change them and never
 * submits them. Keep in step with the server's retired-key list.
 */
export const RETIRED_LEGACY_KEYS = [
  'silentStationMinutes',
  'staleDeviceMinutes',
  'implausibleTapsPerMinute',
  'longShiftMinutes',
  'captureUndoWindowSeconds',
  'captureSendGraceSeconds',
  'outboxWarningCount',
  'outboxWarningAgeMinutes',
] as const satisfies readonly (keyof RuntimeSettings)[];

export function isRetiredLegacyKey(key: string): boolean {
  return (RETIRED_LEGACY_KEYS as readonly string[]).includes(key);
}
