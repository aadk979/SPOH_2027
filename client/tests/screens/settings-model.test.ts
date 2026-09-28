import { describe, expect, it } from 'vitest';
import {
  buildSettingsPatch,
  type SettingsDraft,
} from '@/features/settings/model/buildSettingsPatch';
import { NUMERIC_FIELDS } from '@/features/settings/model/numericFields';

function validDraft(): SettingsDraft {
  return {
    eventName: ' Test event ',
    draft: Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, '2'])),
    morning: { start: '09:00', end: '13:00' },
    afternoon: { start: '12:00', end: '18:00' },
  };
}
describe('settings patch validation', () => {
  it('trims names and numbers, preserves overlapping blocks and includes every numeric field', () => {
    const input = validDraft();
    input.draft.implausibleTapsPerMinute = ' 2.5 ';
    expect(buildSettingsPatch(input)).toEqual({
      patch: {
        eventName: 'Test event',
        ...Object.fromEntries(
          NUMERIC_FIELDS.map((field) => [
            field.key,
            field.key === 'implausibleTapsPerMinute' ? 2.5 : 2,
          ]),
        ),
        shiftBlocks: { MORNING: input.morning, AFTERNOON: input.afternoon },
      },
    });
  });
  it.each([
    ['', 'Event name cannot be empty.'],
    [' '.repeat(3), 'Event name cannot be empty.'],
    ['a'.repeat(81), 'Event name must be 80 characters or fewer.'],
  ])('validates event name before missing numeric fields: %j', (eventName, error) => {
    expect(buildSettingsPatch({ ...validDraft(), eventName, draft: {} })).toEqual({ error });
  });
  it.each(NUMERIC_FIELDS)('preserves bounds and required validation for $key', (field) => {
    for (const raw of ['', ' ', undefined]) {
      const input = validDraft();
      if (raw === undefined) delete input.draft[field.key];
      else input.draft[field.key] = raw;
      expect(buildSettingsPatch(input)).toEqual({ error: `${field.label} cannot be empty.` });
    }
    for (const raw of ['NaN', 'Infinity', String(field.min - 1), String(field.max + 1)]) {
      const input = validDraft();
      input.draft[field.key] = raw;
      expect(buildSettingsPatch(input)).toEqual({
        error: `${field.label} must be a number between ${field.min} and ${field.max} ${field.unit}.`,
      });
    }
    for (const bound of [field.min, field.max]) {
      const input = validDraft();
      input.draft[field.key] = String(bound);
      expect(buildSettingsPatch(input)).toHaveProperty('patch');
    }
  });
  it.each(NUMERIC_FIELDS.filter((field) => field.key !== 'implausibleTapsPerMinute'))(
    'requires integer $key',
    (field) => {
      const input = validDraft();
      input.draft[field.key] = '1.5';
      expect(buildSettingsPatch(input)).toEqual({
        error: `${field.label} must be a whole number.`,
      });
    },
  );
  it('validates numeric fields in their displayed order before shift blocks', () => {
    const input = validDraft();
    input.draft.silentStationMinutes = '';
    input.draft.staleDeviceMinutes = '';
    input.morning.start = '';
    expect(buildSettingsPatch(input)).toEqual({ error: 'Station silence cannot be empty.' });
  });
  it.each(['morning', 'afternoon'] as const)(
    'requires both %s endpoints and rejects reversed or equal times',
    (block) => {
      for (const endpoint of ['start', 'end'] as const) {
        const input = validDraft();
        input[block][endpoint] = '';
        expect(buildSettingsPatch(input)).toEqual({
          error: 'All shift block start and end times must be specified.',
        });
      }
      for (const end of ['09:00', '08:00']) {
        const input = validDraft();
        input[block] = { start: '09:00', end };
        expect(buildSettingsPatch(input)).toEqual({
          error: `${block === 'morning' ? 'Morning' : 'Afternoon'} shift block must end after it starts.`,
        });
      }
    },
  );
});
