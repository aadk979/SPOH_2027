import { describe, expect, it } from 'vitest';
import {
  eventDateOf,
  eventDayAnchor,
  eventDayAnchorOf,
  eventDayStart,
  fixedClock,
  localHourLabel,
  localTimestamp,
  minutesBetween,
  systemClock,
  type EventZone,
} from '../../src/platform/time/index.js';
import { hourlyRows } from '../../src/modules/report/domain/hours.js';

/**
 * Time handling (engineering-standards §7, ADR-004 §3).
 *
 * Everything is stored UTC; the event's own zone and day boundary answer
 * "which event day is today" and "which local hour is this". Getting either
 * wrong puts a capture on the wrong day or a dashboard's "today" in the wrong
 * place, so the boundaries are pinned down here, DST days included (the F01
 * time audit's cases).
 */

const zone = (timezone: string, dayBoundaryMinutes = 0): EventZone => ({
  timezone,
  dayBoundaryMinutes,
});
const at = (iso: string) => new Date(iso);

describe('eventDateOf', () => {
  it.each([
    // F01 case 1: Singapore regression.
    ['2027-01-07T05:45:00Z', zone('Asia/Singapore'), '2027-01-07'],
    ['2027-01-06T15:59:59Z', zone('Asia/Singapore'), '2027-01-06'],
    ['2027-01-06T16:00:00Z', zone('Asia/Singapore'), '2027-01-07'],
    // F01 case 5: day boundary on New York's 23-hour day.
    ['2027-03-15T03:59:00Z', zone('America/New_York'), '2027-03-14'],
    ['2027-03-15T04:00:00Z', zone('America/New_York'), '2027-03-15'],
    // F01 case 8: southern-hemisphere summer time rolls the date over.
    ['2027-01-06T13:30:00Z', zone('Australia/Sydney'), '2027-01-07'],
  ])('dates %s', (instant, eventZone, expected) => {
    expect(eventDateOf(at(instant), eventZone)).toBe(expected);
  });

  it('keeps the small hours on the previous day until the day boundary (ADR-004 §3)', () => {
    const lateNight = zone('Asia/Singapore', 240);
    // 02:00 local on the 8th belongs to the 7th; 04:00 local starts the 8th.
    expect(eventDateOf(at('2027-01-07T18:00:00Z'), lateNight)).toBe('2027-01-07');
    expect(eventDateOf(at('2027-01-07T20:00:00Z'), lateNight)).toBe('2027-01-08');
  });

  it("puts an overnight shift's small hours on the day it started (F01 case 10)", () => {
    // 01:30 CEST on 13 June, with a 04:00 boundary: still event day 12 June.
    expect(eventDateOf(at('2027-06-12T23:30:00Z'), zone('Europe/Berlin', 240))).toBe('2027-06-12');
  });

  it('anchors the event day for matching a date column', () => {
    expect(eventDayAnchorOf(at('2027-01-06T16:30:00Z'), zone('Asia/Singapore')).toISOString()).toBe(
      '2027-01-07T00:00:00.000Z',
    );
  });
});

describe('eventDayStart', () => {
  it('is local midnight in Singapore, not the old 08:00 anchor (F03-013)', () => {
    expect(eventDayStart(at('2027-01-07T03:30:00Z'), zone('Asia/Singapore')).toISOString()).toBe(
      '2027-01-06T16:00:00.000Z',
    );
  });

  it('starts at the day boundary', () => {
    expect(
      eventDayStart(at('2027-01-07T03:30:00Z'), zone('Asia/Singapore', 240)).toISOString(),
    ).toBe('2027-01-06T20:00:00.000Z');
  });

  it('follows the offset change on a London DST day', () => {
    // 28 Mar 2027: the day starts at 00:00 GMT and ends at 00:00 BST (23 hours).
    const london = zone('Europe/London');
    expect(eventDayStart(at('2027-03-28T12:00:00Z'), london).toISOString()).toBe(
      '2027-03-28T00:00:00.000Z',
    );
    expect(eventDayStart(at('2027-03-29T12:00:00Z'), london).toISOString()).toBe(
      '2027-03-28T23:00:00.000Z',
    );
  });
});

describe('eventDayAnchor', () => {
  it('anchors a date to UTC midnight, matching a Postgres date column', () => {
    expect(eventDayAnchor('2027-01-07').toISOString()).toBe('2027-01-07T00:00:00.000Z');
  });
});

describe('local labels', () => {
  it('labels an hour bucket with the local hour the event experienced', () => {
    expect(localHourLabel(at('2027-01-07T03:00:00Z'), 'Asia/Singapore')).toBe('2027-01-07 11:00');
    expect(localHourLabel(at('2027-01-06T17:00:00Z'), 'Asia/Singapore')).toBe('2027-01-07 01:00');
    // F01 case 6: at +05:30 the local hour starting 03:30Z is 09:00.
    expect(localHourLabel(at('2027-01-07T03:30:00Z'), 'Asia/Kolkata')).toBe('2027-01-07 09:00');
  });

  it('prints the offset on every export timestamp, across a transition (F01 case 9)', () => {
    expect(localTimestamp(at('2027-10-30T12:00:00Z'), 'Europe/London')).toBe(
      '2027-10-30 13:00 +01:00',
    );
    expect(localTimestamp(at('2027-10-31T12:00:00Z'), 'Europe/London')).toBe(
      '2027-10-31 12:00 +00:00',
    );
    expect(localTimestamp(at('2027-01-07T02:05:00Z'), 'Asia/Singapore')).toBe(
      '2027-01-07 10:05 +08:00',
    );
  });

  it('keeps the repeated hour as two rows told apart by offset (F01 case 4)', () => {
    const rows = hourlyRows(
      [
        { hour: at('2027-10-30T23:00:00Z'), value: 1 },
        { hour: at('2027-10-31T00:00:00Z'), value: 2 },
        { hour: at('2027-10-31T01:00:00Z'), value: 3 },
        { hour: at('2027-10-31T02:00:00Z'), value: 4 },
      ],
      'Europe/London',
    );
    expect(rows.map((row) => row.localHour)).toEqual([
      '2027-10-31 00:00',
      '2027-10-31 01:00 +01:00',
      '2027-10-31 01:00 +00:00',
      '2027-10-31 02:00',
    ]);
  });
});

describe('minutesBetween', () => {
  it('floors partial minutes', () => {
    expect(minutesBetween(at('2027-01-07T03:00:00Z'), at('2027-01-07T03:07:59Z'))).toBe(7);
  });

  it('never returns a negative duration', () => {
    expect(minutesBetween(at('2027-01-07T04:00:00Z'), at('2027-01-07T03:00:00Z'))).toBe(0);
  });
});

describe('Clock', () => {
  it('a fixed clock returns its instant, as a fresh Date each time', () => {
    const instant = at('2027-01-07T03:30:00.000Z');
    const clock = fixedClock(instant);

    const first = clock.now();
    first.setUTCFullYear(2000);

    expect(clock.now().toISOString()).toBe(instant.toISOString());
  });

  it('the system clock reads the process clock', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
  });
});
