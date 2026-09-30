import { describe, expect, it } from 'vitest';
import {
  shiftDate,
  shiftDayAnchor,
  shiftWallInstant,
} from '../../src/modules/event/domain/cloneShift.js';

/** P09.9: a clone moves days by whole days and keeps shifts at their wall-clock times. */
describe('clone date moves', () => {
  it('moves dates across month, year and leap-day boundaries', () => {
    expect(shiftDate('2027-01-07', 365)).toBe('2028-01-07');
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftDayAnchor(new Date('2027-01-07T00:00:00Z'), 364).toISOString()).toBe(
      '2028-01-06T00:00:00.000Z',
    );
  });

  it('keeps a shift at its local time when the new date is on the other side of DST', () => {
    // 09:30 GMT on 20 March 2027 (winter) becomes 09:30 BST on 29 March 2027:
    // one hour earlier in UTC, the same on the event's clock.
    const start = new Date('2027-03-20T09:30:00Z');
    expect(shiftWallInstant(start, 9, 'Europe/London').toISOString()).toBe(
      '2027-03-29T08:30:00.000Z',
    );
  });

  it('is plain day arithmetic where the zone has no DST', () => {
    const start = new Date('2027-01-07T01:30:00Z'); // 09:30 Singapore
    expect(shiftWallInstant(start, 365, 'Asia/Singapore').toISOString()).toBe(
      '2028-01-07T01:30:00.000Z',
    );
  });
});
