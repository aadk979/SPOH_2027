import type { RuntimeSettings } from '@spoh/shared';
import { NUMERIC_FIELDS } from './numericFields';

/** What the settings screen edits: text as typed, numbers as their input strings. */
export type SettingsValues = Record<string, string> & { eventName: string };

export const EMPTY_SETTINGS: SettingsValues = { eventName: '' };

export function toSettingsValues(settings: RuntimeSettings): SettingsValues {
  return {
    ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, String(settings[field.key])])),
    eventName: settings.eventName ?? '',
  };
}

function toNumber(raw: string | undefined): number | undefined {
  const text = raw?.trim() ?? '';
  return text ? Number(text) : undefined;
}

/**
 * Validate the complete form before selecting the changed keys for its patch.
 */
export function toSettingsRequest(values: SettingsValues) {
  return {
    eventName: values.eventName.trim(),
    ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, toNumber(values[field.key])])),
  };
}

/** Compare normalised input with the values this draft was seeded from. */
export function hasSettingsChanges(values: SettingsValues, baseline: RuntimeSettings): boolean {
  return Object.entries(toSettingsRequest(values)).some(
    ([key, value]) => value !== baseline[key as keyof RuntimeSettings],
  );
}

/** Only a parsed complete form may become a patch (ADR-003 §2, F02-005). */
export function toSettingsPatch(
  settings: RuntimeSettings,
  baseline: RuntimeSettings,
): Partial<RuntimeSettings> {
  return Object.fromEntries(
    Object.entries(settings).filter(
      ([key, value]) => value !== baseline[key as keyof RuntimeSettings],
    ),
  );
}
