import type { UpdateSettingsRequest } from '@spoh/shared';
import { ValidationError } from '../../../platform/errors/index.js';

/**
 * Operational settings whose writes moved to the scoped settings catalogue
 * (POST /admin/settings/catalogue). The legacy global store may no longer be
 * written for them, so an old client cannot change a value that the scoped
 * store now governs (ADR-003 migration, P10.2). The capture and outbox keys were
 * retired one release before their copy, as the thresholds were.
 */
export const RETIRED_LEGACY_SETTING_KEYS = [
  'silentStationMinutes',
  'staleDeviceMinutes',
  'implausibleTapsPerMinute',
  'longShiftMinutes',
  'captureUndoWindowSeconds',
  'captureSendGraceSeconds',
  'outboxWarningCount',
  'outboxWarningAgeMinutes',
] as const satisfies readonly (keyof UpdateSettingsRequest)[];

/**
 * Privacy settings whose writes moved to the event's guarded settings
 * (PATCH /admin/event-settings), where lost-person retention is capped at the
 * 24 hours promised to families (D-16).
 */
export const GUARDED_LEGACY_SETTING_KEYS = [
  'lostPersonPurgeHours',
] as const satisfies readonly (keyof UpdateSettingsRequest)[];

function refuse(
  patch: UpdateSettingsRequest,
  moved: { keys: readonly (keyof UpdateSettingsRequest)[]; replacement: string; message: string },
): void {
  const keys = moved.keys.filter((key) => patch[key] !== undefined);
  if (keys.length > 0)
    throw new ValidationError(moved.message, { keys, replacement: moved.replacement });
}

/** Refuse the whole patch before any write if it names a retired key. */
export function assertNoRetiredLegacyKeys(patch: UpdateSettingsRequest): void {
  refuse(patch, {
    keys: RETIRED_LEGACY_SETTING_KEYS,
    replacement: '/admin/settings/catalogue',
    message: 'These settings are changed in the settings catalogue, not on this endpoint.',
  });
  refuse(patch, {
    keys: GUARDED_LEGACY_SETTING_KEYS,
    replacement: '/admin/event-settings',
    message:
      "This setting is changed in the event's counts and visitor data settings, not on this endpoint.",
  });
}
