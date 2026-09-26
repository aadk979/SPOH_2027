import { describe, expect, it } from 'vitest';
import {
  activeShiftBlocks,
  eventDayAnchor,
  fixedClock,
  floorToBucket,
  minutesBetween,
  singaporeDateString,
  singaporeMinuteOfDay,
  systemClock,
} from '../../src/platform/time/index.js';

/**
 * Time handling (BUILD_PLAN §3.3).
 *
 * Everything is stored UTC; Singapore time exists only to answer "which event
 * day is today" and "which shift block is running". Getting either wrong makes
 * station scoping reject a volunteer who is standing at their post, so the
 * boundaries are pinned down here explicitly.
 */

describe('singaporeDateString', () => {
  it('rolls the date over at 16:00 UTC, which is midnight in Singapore', () => {
    expect(singaporeDateString(new Date('2027-01-06T15:59:59Z'))).toBe('2027-01-06');
    expect(singaporeDateString(new Date('2027-01-06T16:00:00Z'))).toBe('2027-01-07');
  });

  it('treats an early-morning UTC instant as the same Singapore day', () => {
    expect(singaporeDateString(new Date('2027-01-07T03:30:00Z'))).toBe('2027-01-07');
  });
});

describe('eventDayAnchor', () => {
  it('anchors a date to UTC midnight, matching a Postgres date column', () => {
    expect(eventDayAnchor('2027-01-07').toISOString()).toBe('2027-01-07T00:00:00.000Z');
  });
});

describe('singaporeMinuteOfDay', () => {
  it('converts a UTC instant to local minutes past midnight', () => {
    // 03:30 UTC is 11:30 in Singapore.
    expect(singaporeMinuteOfDay(new Date('2027-01-07T03:30:00Z'))).toBe(11 * 60 + 30);
  });
});

describe('activeShiftBlocks', () => {
  // Explicitly not the override: these assert the real event-hours rule.
  const at = (utc: string) => activeShiftBlocks(new Date(utc), false);

  it('reports no block before the morning shift starts', () => {
    // 09:00 SGT — half an hour before the morning block opens.
    expect(at('2027-01-07T01:00:00Z')).toEqual([]);
  });

  it('reports MORNING during the morning shift', () => {
    expect(at('2027-01-07T03:30:00Z')).toEqual(['MORNING']);
  });

  it('reports both blocks during the 13:30-14:00 handover', () => {
    // 13:45 SGT. The overlap is intentional: both shifts are genuinely on the
    // floor, and a volunteer from either must be able to keep capturing.
    expect(at('2027-01-07T05:45:00Z').sort()).toEqual(['AFTERNOON', 'MORNING']);
  });

  it('reports AFTERNOON after the morning shift ends', () => {
    expect(at('2027-01-07T08:00:00Z')).toEqual(['AFTERNOON']);
  });

  it('reports no block after the afternoon shift ends', () => {
    // 18:00 SGT exactly — the block is half-open, so this is already outside.
    // A counter left running overnight therefore cannot keep writing.
    expect(at('2027-01-07T10:00:00Z')).toEqual([]);
  });
});

describe('floorToBucket', () => {
  it('floors to a 30-minute boundary', () => {
    expect(floorToBucket(new Date('2027-01-07T03:44:59Z'), 30).toISOString()).toBe(
      '2027-01-07T03:30:00.000Z',
    );
  });

  it('leaves an exact boundary alone', () => {
    expect(floorToBucket(new Date('2027-01-07T03:30:00Z'), 30).toISOString()).toBe(
      '2027-01-07T03:30:00.000Z',
    );
  });
});

describe('minutesBetween', () => {
  it('floors partial minutes', () => {
    expect(minutesBetween(new Date('2027-01-07T03:00:00Z'), new Date('2027-01-07T03:07:59Z'))).toBe(
      7,
    );
  });

  it('never returns a negative duration', () => {
    expect(minutesBetween(new Date('2027-01-07T04:00:00Z'), new Date('2027-01-07T03:00:00Z'))).toBe(
      0,
    );
  });
});

describe('Clock', () => {
  it('a fixed clock returns its instant, as a fresh Date each time', () => {
    const instant = new Date('2027-01-07T03:30:00.000Z');
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
