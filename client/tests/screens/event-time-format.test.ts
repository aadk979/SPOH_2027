import { describe, expect, it } from 'vitest';
import { formatDateTime, formatTime } from '@/shared/lib/format';

/**
 * P09.6: times are shown on the event's clock, passed in, never on the
 * device's zone or a compiled constant (F01-026).
 */
describe('event-time formatting', () => {
  const singapore = { timeZone: 'Asia/Singapore', locale: 'en-SG' };
  const london = { timeZone: 'Europe/London', locale: 'en-GB' };

  it("renders an instant on the event's wall clock", () => {
    expect(formatTime('2027-01-07T06:05:00Z', singapore)).toBe('02:05 pm');
    expect(formatTime('2027-01-07T06:05:00Z', london)).toBe('06:05');
  });

  it('follows the event across a DST change', () => {
    expect(formatTime('2027-10-30T12:00:00Z', london)).toBe('13:00');
    expect(formatTime('2027-10-31T12:00:00Z', london)).toBe('12:00');
  });

  it('dates by the event, not by UTC', () => {
    expect(formatDateTime('2027-01-06T16:30:00Z', singapore)).toBe('7 Jan, 12:30 am');
  });

  it("shows a dash rather than a guess until the event's clock is known", () => {
    expect(formatTime('2027-01-07T06:05:00Z', null)).toBe('—');
    expect(formatDateTime('2027-01-07T06:05:00Z', null)).toBe('—');
    expect(formatTime('not a time', singapore)).toBe('—');
  });
});
