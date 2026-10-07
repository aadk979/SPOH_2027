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

/** Refuse the whole patch before any write if it names a retired key. */
export function assertNoRetiredLegacyKeys(patch: UpdateSettingsRequest): void {
  const retired = RETIRED_LEGACY_SETTING_KEYS.filter((key) => patch[key] !== undefined);
  if (retired.length === 0) return;
  throw new ValidationError(
    'These settings are changed in the settings catalogue, not on this endpoint.',
    { keys: retired, replacement: '/admin/settings/catalogue' },
  );
}
