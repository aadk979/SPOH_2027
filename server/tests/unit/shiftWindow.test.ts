import { describe, expect, it } from 'vitest';
import { shiftWindow } from '../../src/modules/eventDays/domain/shiftWindow.js';

const iso = (window: { startsAt: Date; endsAt: Date }) => [
  window.startsAt.toISOString(),
  window.endsAt.toISOString(),
];

describe('shiftWindow', () => {
  it('reads the template hours on the day, in the event timezone', () => {
    const morning = { startLocal: '09:30', endLocal: '14:00', endsNextDay: false };
    expect(iso(shiftWindow('2027-01-07', morning, 'Asia/Singapore'))).toEqual([
      '2027-01-07T01:30:00.000Z',
      '2027-01-07T06:00:00.000Z',
    ]);
  });

  it('ends an overnight shift on the next day (F01 case 10)', () => {
    const late = { startLocal: '22:00', endLocal: '02:00', endsNextDay: true };
    expect(iso(shiftWindow('2027-06-12', late, 'Europe/Berlin'))).toEqual([
      '2027-06-12T20:00:00.000Z',
      '2027-06-13T00:00:00.000Z',
    ]);
  });

  it('is an hour shorter across spring forward (F01 case 2)', () => {
    const block = { startLocal: '00:30', endLocal: '02:30', endsNextDay: false };
    const window = shiftWindow('2027-03-28', block, 'Europe/London');
    expect(window.endsAt.getTime() - window.startsAt.getTime()).toBe(60 * 60_000);
  });
});
