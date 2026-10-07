import type { RuntimeSettings } from '@spoh/shared';

/**
 * Settings the legacy endpoint now refuses, so this form shows where to change
 * them and never submits them. Keep in step with the server's retired-key lists.
 * Most moved to the scoped settings catalogue; lost-person retention moved to
 * the event's counts and visitor data settings (D-16).
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
  'lostPersonPurgeHours',
  'dashboardPollSeconds',
  'alertPollSeconds',
  'refreshSessionDays',
  'idempotencyRetentionDays',
] as const satisfies readonly (keyof RuntimeSettings)[];

const ORGANISATION_KEYS: readonly string[] = [
  'dashboardPollSeconds',
  'alertPollSeconds',
  'refreshSessionDays',
  'idempotencyRetentionDays',
];

/** Where a retired key is changed now. */
export function retiredLegacyHome(key: string): 'catalogue' | 'visitorData' | 'organisation' {
  if (key === 'lostPersonPurgeHours') return 'visitorData';
  return ORGANISATION_KEYS.includes(key) ? 'organisation' : 'catalogue';
}

export function isRetiredLegacyKey(key: string): boolean {
  return (RETIRED_LEGACY_KEYS as readonly string[]).includes(key);
}
