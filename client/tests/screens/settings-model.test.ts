import { describe, expect, it } from 'vitest';
import { RuntimeSettings, UpdateSettingsRequest } from '@spoh/shared';
import { NUMERIC_FIELDS } from '@/features/settings/model/numericFields';
import {
  toSettingsRequest,
  toSettingsValues,
  type SettingsValues,
} from '@/features/settings/model/settingsValues';

function validValues(): SettingsValues {
  return {
    ...Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, '2'])),
    eventName: ' Test event ',
    morning: { start: '09:00', end: '13:00' },
    afternoon: { start: '12:00', end: '18:00' },
  };
}

function issuesFor(values: SettingsValues) {
  const result = RuntimeSettings.safeParse(toSettingsRequest(values));
  // Distinct paths: the form shows the first message per field.
  return result.success ? [] : [...new Set(result.error.issues.map((i) => i.path.join('.')))];
}

describe('settings request', () => {
  it('trims names and numbers, keeps overlapping blocks and includes every setting', () => {
    const values = validValues();
    values.implausibleTapsPerMinute = ' 2.5 ';
    const parsed = RuntimeSettings.parse(toSettingsRequest(values));
    expect(parsed).toEqual({
      eventName: 'Test event',
      ...Object.fromEntries(
        NUMERIC_FIELDS.map((field) => [
          field.key,
          field.key === 'implausibleTapsPerMinute' ? 2.5 : 2,
        ]),
      ),
      shiftBlocks: { MORNING: values.morning, AFTERNOON: values.afternoon },
    });
    // The full object is also a valid patch: the server accepts what the screen sends.
    expect(UpdateSettingsRequest.safeParse(parsed).success).toBe(true);
  });

  it('round-trips the server values through the editable form', () => {
    const settings = RuntimeSettings.parse(toSettingsRequest(validValues()));
    expect(RuntimeSettings.parse(toSettingsRequest(toSettingsValues(settings)))).toEqual(settings);
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

  it.each(['morning', 'afternoon'] as const)(
    'requires both %s times and rejects reversed or equal blocks',
    (block) => {
      const key = block === 'morning' ? 'MORNING' : 'AFTERNOON';
      for (const endpoint of ['start', 'end'] as const) {
        const values = validValues();
        values[block] = { ...values[block], [endpoint]: '' };
        expect(issuesFor(values)).toEqual([`shiftBlocks.${key}.${endpoint}`]);
      }
      for (const end of ['09:00', '08:00']) {
        const values = validValues();
        values[block] = { start: '09:00', end };
        expect(issuesFor(values)).toEqual([`shiftBlocks.${key}.end`]);
      }
    },
  );
});
