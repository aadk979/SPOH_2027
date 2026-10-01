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
 * The full settings object before schema validation. The screen saves every
 * value, unchanged ones included, so the payload is validated as a complete
 * `RuntimeSettings`, which the `UpdateSettingsRequest` patch schema accepts.
 */
export function toSettingsRequest(values: SettingsValues) {
  return {
    eventName: values.eventName.trim(),
    ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, toNumber(values[field.key])])),
  };
}
