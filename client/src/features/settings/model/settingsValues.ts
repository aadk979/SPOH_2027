import type { RuntimeSettings } from '@spoh/shared';
import { NUMERIC_FIELDS } from './numericFields';

export interface ShiftBlockValue {
  start: string;
  end: string;
}

/** What the settings screen edits: text as typed, numbers as their input strings. */
export type SettingsValues = Record<string, string | ShiftBlockValue> & {
  eventName: string;
  morning: ShiftBlockValue;
  afternoon: ShiftBlockValue;
};

export const EMPTY_SETTINGS: SettingsValues = {
  eventName: '',
  morning: { start: '', end: '' },
  afternoon: { start: '', end: '' },
};

/** A shift block's errors belong to the row that edits it. */
export const SETTINGS_ERROR_FIELDS = {
  'shiftBlocks.MORNING': 'morning',
  'shiftBlocks.AFTERNOON': 'afternoon',
} as const;

export function toSettingsValues(settings: RuntimeSettings): SettingsValues {
  return {
    ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, String(settings[field.key])])),
    eventName: settings.eventName ?? '',
    morning: settings.shiftBlocks.MORNING,
    afternoon: settings.shiftBlocks.AFTERNOON,
  };
}

function toNumber(raw: string | ShiftBlockValue | undefined): number | undefined {
  const text = typeof raw === 'string' ? raw.trim() : '';
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
    shiftBlocks: { MORNING: values.morning, AFTERNOON: values.afternoon },
  };
}
