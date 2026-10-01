import { describe, expect, it } from 'vitest';
import { shiftHours } from '@/shared/lib/format';
import { shiftHoursError } from '@/features/settings/model/shiftHours';

/**
 * F01-046: shift labels must follow the shift's own hours, which an admin
 * moves for a dry run, not the hours the client was compiled with. Since
 * P09.10 the hours come with the shift itself (ADR-002).
 */

const MOVED = {
  label: 'Morning',
  // 08:00–12:30 in Singapore (UTC+8).
  startsAt: '2027-01-07T00:00:00.000Z',
  endsAt: '2027-01-07T04:30:00.000Z',
};

describe('shift labels (F01-046)', () => {
  it("labels a shift with its own hours on the event's clock", () => {
    expect(shiftHours(MOVED, 'Asia/Singapore')).toBe('08:00–12:30');
    expect(shiftHours(MOVED, 'Europe/London')).toBe('00:00–04:30');
  });

  it("names the shift until the event's clock is known", () => {
    expect(shiftHours(MOVED, undefined)).toBe('Morning');
  });
});

describe('shift hours on the settings screen', () => {
  it('refuses a shift that ends before it starts, unless it runs past midnight', () => {
    expect(shiftHoursError({ start: '09:00', end: '13:00' }, false)).toBeUndefined();
    expect(shiftHoursError({ start: '09:00', end: '09:00' }, false)).toBeDefined();
    expect(shiftHoursError({ start: '22:00', end: '06:00' }, false)).toBeDefined();
    expect(shiftHoursError({ start: '22:00', end: '06:00' }, true)).toBeUndefined();
  });

  it('requires both times', () => {
    expect(shiftHoursError({ start: '', end: '13:00' }, false)).toBe('Enter both times');
    expect(shiftHoursError({ start: '09:00', end: '' }, false)).toBe('Enter both times');
  });
});
