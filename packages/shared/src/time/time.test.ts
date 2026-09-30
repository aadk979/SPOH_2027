import { describe, expect, it } from 'vitest';
import {
  nextDate,
  previousDate,
  wallTimeToInstant,
  zonedDate,
  zonedDayWindow,
  zonedOffset,
  zonedWallTime,
} from './index.js';

const iso = (date: Date) => date.toISOString();

describe('wallTimeToInstant', () => {
  it.each([
    ['2027-01-07', '09:30', 'Asia/Singapore', '2027-01-07T01:30:00.000Z'],
    ['2027-01-07', '09:00', 'Asia/Kolkata', '2027-01-07T03:30:00.000Z'],
    ['2027-01-07', '10:00', 'Asia/Kathmandu', '2027-01-07T04:15:00.000Z'],
    ['2027-01-07', '00:30', 'Australia/Sydney', '2027-01-06T13:30:00.000Z'],
    ['2027-06-12', '22:00', 'Europe/Berlin', '2027-06-12T20:00:00.000Z'],
  ])('reads %s %s in %s', (date, time, tz, expected) => {
    expect(iso(wallTimeToInstant(date, time, tz))).toBe(expected);
  });

  it('moves a skipped time forward to the transition (London, 28 Mar 2027)', () => {
    // 01:00 GMT becomes 02:00 BST: 01:30 local never happens.
    expect(iso(wallTimeToInstant('2027-03-28', '01:30', 'Europe/London'))).toBe(
      '2027-03-28T01:00:00.000Z',
    );
    expect(iso(wallTimeToInstant('2027-03-28', '02:30', 'Europe/London'))).toBe(
      '2027-03-28T01:30:00.000Z',
    );
    expect(iso(wallTimeToInstant('2027-03-28', '00:30', 'Europe/London'))).toBe(
      '2027-03-28T00:30:00.000Z',
    );
  });

  it('takes the earlier occurrence of a repeated time (London, 31 Oct 2027)', () => {
    // 02:00 BST becomes 01:00 GMT: 01:30 local happens at 00:30Z and at 01:30Z.
    expect(iso(wallTimeToInstant('2027-10-31', '01:30', 'Europe/London'))).toBe(
      '2027-10-31T00:30:00.000Z',
    );
  });

  it('rejects what is not a wall time', () => {
    expect(() => wallTimeToInstant('7 Jan', '09:30', 'Asia/Singapore')).toThrow(RangeError);
    expect(() => wallTimeToInstant('2027-01-07', '9:30', 'Asia/Singapore')).toThrow(RangeError);
  });
});

describe('zonedDate', () => {
  it.each([
    ['2027-01-07T05:45:00Z', 'Asia/Singapore', '2027-01-07'],
    ['2027-03-15T03:59:00Z', 'America/New_York', '2027-03-14'],
    ['2027-03-15T04:00:00Z', 'America/New_York', '2027-03-15'],
    ['2027-01-06T13:30:00Z', 'Australia/Sydney', '2027-01-07'],
  ])('dates %s in %s', (instant, tz, expected) => {
    expect(zonedDate(new Date(instant), tz)).toBe(expected);
  });
});

describe('zonedDayWindow', () => {
  it('is 24 hours in Singapore', () => {
    const { start, end } = zonedDayWindow('2027-01-07', 'Asia/Singapore');
    expect(iso(start)).toBe('2027-01-06T16:00:00.000Z');
    expect(iso(end)).toBe('2027-01-07T16:00:00.000Z');
  });

  it('is 23 hours on a spring-forward day and 25 on a fall-back day', () => {
    const spring = zonedDayWindow('2027-03-14', 'America/New_York');
    const fall = zonedDayWindow('2027-11-07', 'America/New_York');
    expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * 3_600_000);
    expect(fall.end.getTime() - fall.start.getTime()).toBe(25 * 3_600_000);
  });

  it('starts at the event boundary', () => {
    const { start } = zonedDayWindow('2027-01-07', 'Asia/Singapore', 4 * 60);
    expect(iso(start)).toBe('2027-01-06T20:00:00.000Z');
  });

  it('crosses month and year ends', () => {
    expect(nextDate('2026-12-31')).toBe('2027-01-01');
    expect(nextDate('2028-02-28')).toBe('2028-02-29');
  });
});

describe('previousDate', () => {
  it('crosses month and year starts', () => {
    expect(previousDate('2027-01-01')).toBe('2026-12-31');
    expect(previousDate('2028-03-01')).toBe('2028-02-29');
  });
});

describe('zonedWallTime and zonedOffset', () => {
  it.each([
    ['2027-01-07T03:30:00Z', 'Asia/Singapore', '2027-01-07T11:30', '+08:00'],
    ['2027-01-07T04:10:00Z', 'Asia/Kolkata', '2027-01-07T09:40', '+05:30'],
    ['2027-01-07T04:20:00Z', 'Asia/Kathmandu', '2027-01-07T10:05', '+05:45'],
    ['2027-01-06T13:30:00Z', 'Australia/Sydney', '2027-01-07T00:30', '+11:00'],
    ['2027-03-15T03:59:00Z', 'America/New_York', '2027-03-14T23:59', '-04:00'],
  ])('reads %s in %s', (instant, tz, wall, offset) => {
    expect(zonedWallTime(new Date(instant), tz)).toBe(wall);
    expect(zonedOffset(new Date(instant), tz)).toBe(offset);
  });

  it('tells the two occurrences of a repeated hour apart by offset (F01 case 9)', () => {
    const first = new Date('2027-10-31T00:15:00Z');
    const second = new Date('2027-10-31T01:15:00Z');
    expect(zonedWallTime(first, 'Europe/London')).toBe('2027-10-31T01:15');
    expect(zonedWallTime(second, 'Europe/London')).toBe('2027-10-31T01:15');
    expect(zonedOffset(first, 'Europe/London')).toBe('+01:00');
    expect(zonedOffset(second, 'Europe/London')).toBe('+00:00');
  });
});
