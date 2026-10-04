import { describe, expect, it } from 'vitest';
import { RuntimeSettings, UpdateSettingsRequest } from '@spoh/shared';
import { NUMERIC_FIELDS } from '@/features/settings/model/numericFields';
import {
  toSettingsRequest,
  toSettingsValues,
  hasSettingsChanges,
  toSettingsPatch,
  type SettingsValues,
} from '@/features/settings/model/settingsValues';

function validValues(): SettingsValues {
  return {
    ...Object.fromEntries(
      NUMERIC_FIELDS.map((field) => [field.key, String(Math.max(2, field.min))]),
    ),
    eventName: ' Test event ',
  };
}

function issuesFor(values: SettingsValues) {
  const result = RuntimeSettings.safeParse(toSettingsRequest(values));
  // Distinct paths: the form shows the first message per field.
  return result.success ? [] : [...new Set(result.error.issues.map((i) => i.path.join('.')))];
}

describe('settings request', () => {
  it('trims names and numbers and includes every setting', () => {
    const values = validValues();
    values.implausibleTapsPerMinute = ' 2.5 ';
    const parsed = RuntimeSettings.parse(toSettingsRequest(values));
    expect(parsed).toEqual({
      eventName: 'Test event',
      ...Object.fromEntries(
        NUMERIC_FIELDS.map((field) => [
          field.key,
          field.key === 'implausibleTapsPerMinute' ? 2.5 : Math.max(2, field.min),
        ]),
      ),
    });
    // Full-form validation precedes selecting the keys for the actual patch.
    expect(UpdateSettingsRequest.safeParse(parsed).success).toBe(true);
  });

  it('round-trips the server values through the editable form', () => {
    const settings = RuntimeSettings.parse(toSettingsRequest(validValues()));
    expect(RuntimeSettings.parse(toSettingsRequest(toSettingsValues(settings)))).toEqual(settings);
  });

  it('makes an untouched valid form an empty patch', () => {
    const original = RuntimeSettings.parse(toSettingsRequest(validValues()));
    expect(hasSettingsChanges(toSettingsValues(original), original)).toBe(false);
    expect(toSettingsPatch(original, original)).toEqual({});
  });

  it('selects only changed parsed keys, including decimal numeric settings', () => {
    const original = RuntimeSettings.parse(toSettingsRequest(validValues()));
    const parsed = RuntimeSettings.parse({
      ...original,
      eventName: 'Reviewed',
      implausibleTapsPerMinute: 3.5,
    });
    const patch = toSettingsPatch(parsed, original);
    expect(patch).toEqual({ eventName: 'Reviewed', implausibleTapsPerMinute: 3.5 });
    expect(UpdateSettingsRequest.parse(patch)).toEqual(patch);
  });

  it('normalises whitespace and numeric formatting before checking for changes', () => {
    const original = RuntimeSettings.parse(toSettingsRequest(validValues()));
    const values = {
      ...toSettingsValues(original),
      eventName: ` ${original.eventName} `,
      implausibleTapsPerMinute: ` ${original.implausibleTapsPerMinute}.0 `,
    };
    expect(hasSettingsChanges(values, original)).toBe(false);
  });

  it('keeps invalid numeric edits dirty so validation can explain the error', () => {
    const original = RuntimeSettings.parse(toSettingsRequest(validValues()));
    expect(
      hasSettingsChanges({ ...toSettingsValues(original), implausibleTapsPerMinute: '' }, original),
    ).toBe(true);
    expect(
      hasSettingsChanges(
        { ...toSettingsValues(original), implausibleTapsPerMinute: 'NaN' },
        original,
      ),
    ).toBe(true);
  });

  it.each(['', '   ', 'a'.repeat(81)])('rejects event name %j', (eventName) => {
    expect(issuesFor({ ...validValues(), eventName })).toEqual(['eventName']);
  });

  it.each(NUMERIC_FIELDS)('keeps bounds and required validation for $key', (field) => {
    for (const raw of ['', ' ', 'NaN', 'Infinity', String(field.min - 1), String(field.max + 1)]) {
      expect(issuesFor({ ...validValues(), [field.key]: raw })).toEqual([field.key]);
    }
    for (const bound of [field.min, field.max]) {
      expect(issuesFor({ ...validValues(), [field.key]: String(bound) })).toEqual([]);
    }
  });

  it.each(NUMERIC_FIELDS.filter((field) => field.key !== 'implausibleTapsPerMinute'))(
    'requires a whole number for $key',
    (field) => {
      expect(issuesFor({ ...validValues(), [field.key]: '1.5' })).toEqual([field.key]);
    },
  );
});
