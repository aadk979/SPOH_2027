import { describe, expect, it } from 'vitest';
import {
  structureCreatable,
  structureWritable,
  templateWindow,
  validateShiftHours,
} from '../../src/modules/structure/domain/windows.js';
describe('structure and shift-window rules', () => {
  it.each(['DRAFT', 'READY', 'REHEARSAL'] as const)('allows initial structure in %s', (status) => {
    expect(structureCreatable(status)).toBe(true);
    expect(structureWritable(status)).toBe(true);
  });
  it.each(['LIVE', 'CLOSED'] as const)(
    'permits labels/retirement while freezing capabilities and shifts in %s',
    (status) => {
      expect(structureCreatable(status)).toBe(false);
      expect(structureWritable(status)).toBe(true);
    },
  );
  it('makes an archived event read-only', () => {
    expect(structureCreatable('ARCHIVED')).toBe(false);
    expect(structureWritable('ARCHIVED')).toBe(false);
  });
  it('uses event wall time and crosses midnight on the next calendar date', () => {
    const window = templateWindow({
      date: '2027-03-27',
      timezone: 'Europe/London',
      hours: { startLocal: '22:00', endLocal: '03:00', endsNextDay: true },
    });
    expect(window.startsAt.toISOString()).toBe('2027-03-27T22:00:00.000Z');
    expect(window.endsAt.toISOString()).toBe('2027-03-28T02:00:00.000Z');
  });
  it('rejects a DST-skipped interval that resolves to the same instant', () => {
    expect(() =>
      templateWindow({
        date: '2027-03-28',
        timezone: 'Europe/London',
        hours: { startLocal: '01:15', endLocal: '01:45', endsNextDay: false },
      }),
    ).toThrow('timezone makes this shift empty');
  });
  it('validates only hour fields on a complete retained record', () => {
    expect(() =>
      validateShiftHours({ startLocal: '13:00', endLocal: '09:00', endsNextDay: false }),
    ).toThrow('end after');
    expect(() =>
      templateWindow({
        date: '2027-01-02',
        timezone: 'Asia/Singapore',
        hours: { startLocal: '09:00', endLocal: '11:00', endsNextDay: false },
      }),
    ).not.toThrow();
  });
});
