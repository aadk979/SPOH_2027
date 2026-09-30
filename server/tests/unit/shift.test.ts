import { describe, expect, it } from 'vitest';
import {
  assertMayComplete,
  assertSlotOpen,
  minutesUntilStart,
} from '../../src/modules/shift/domain/briefingRules.js';
import { longShiftWarnings, staffingGaps } from '../../src/modules/shift/domain/staffing.js';
import {
  assertNotSelf,
  assertOwnShift,
  assertSwapPending,
  assertTargetFree,
} from '../../src/modules/shift/domain/swapRules.js';

/** Shift rules (P06.7): swaps, briefings and staffing, without a database. */

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('swap rules', () => {
  it('lets a volunteer give away only their own shift, to someone else', () => {
    expect(codeOf(() => assertOwnShift({ volunteerId: 'a' }, 'b'))).toBe('FORBIDDEN');
    expect(codeOf(() => assertNotSelf('a', 'a'))).toBe('CONFLICT');
    expect(codeOf(() => assertTargetFree(true, 'busy'))).toBe('CONFLICT');
    expect(codeOf(() => assertSwapPending({ status: 'APPROVED' }))).toBe('SWAP_NOT_PENDING');
    expect(codeOf(() => assertSwapPending({ status: 'REQUESTED' }))).toBeUndefined();
  });
});

describe('briefing rules', () => {
  it('completes an open slot: its briefer, or an IC and above (F03-016)', () => {
    expect(codeOf(() => assertSlotOpen({ completedAt: new Date() }))).toBe(
      'SLOT_ALREADY_COMPLETED',
    );
    const volunteer = { volunteerId: 'y', role: 'VOLUNTEER' as const };
    expect(codeOf(() => assertMayComplete({ briefierId: 'x' }, volunteer))).toBe('FORBIDDEN');
    expect(codeOf(() => assertMayComplete({ briefierId: null }, volunteer))).toBe('FORBIDDEN');
    expect(codeOf(() => assertMayComplete({ briefierId: 'y' }, volunteer))).toBeUndefined();
    expect(
      codeOf(() => assertMayComplete({ briefierId: 'x' }, { volunteerId: 'i', role: 'IC' })),
    ).toBeUndefined();
  });
});

describe('staffingGaps', () => {
  it('names each kind of gap and skips a fully checked-in station', () => {
    const morning = {
      code: 'MORNING',
      label: 'Morning',
      startsAt: '2027-01-07T01:30:00.000Z',
      endsAt: '2027-01-07T06:00:00.000Z',
    };
    const gaps = staffingGaps({
      shifts: [morning],
      stations: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
        { id: 'd', name: 'D' },
      ],
      staffing: [
        { stationId: 'b', block: 'MORNING', assigned: 2, checkedIn: 0 },
        { stationId: 'c', block: 'MORNING', assigned: 2, checkedIn: 1 },
        { stationId: 'd', block: 'MORNING', assigned: 2, checkedIn: 2 },
      ],
    });
    expect(gaps.map((gap) => [gap.stationId, gap.severity, gap.missing])).toEqual([
      ['a', 'UNSTAFFED', 0],
      ['b', 'NOBODY_CHECKED_IN', 2],
      ['c', 'PARTIAL', 1],
    ]);
    // Each gap names its shift as the event does (P09.12).
    expect(gaps.every((gap) => gap.shift.label === 'Morning')).toBe(true);
  });
});

describe('longShiftWarnings', () => {
  it('warns once per person, from their earliest check-in, longest first', () => {
    const now = new Date('2027-01-07T08:00:00.000Z');
    const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000);
    const row = (volunteerId: string, hoursAgo: number) => ({
      volunteerId,
      checkedInAt: at(hoursAgo),
      volunteer: { displayName: volunteerId },
      station: { name: 'Room' },
    });
    const warnings = longShiftWarnings([row('a', 4), row('a', 3), row('b', 5)], now);
    expect(warnings.map((w) => [w.volunteerId, w.minutesOnStation])).toEqual([
      ['b', 300],
      ['a', 240],
    ]);
  });
});

describe('briefing countdown', () => {
  it('counts minutes to a wave, and negative minutes once it has started', () => {
    const start = new Date('2027-01-07T03:30:00.000Z');
    expect(minutesUntilStart(start, new Date('2027-01-07T03:10:00.000Z'))).toBe(20);
    expect(minutesUntilStart(start, new Date('2027-01-07T03:45:30.000Z'))).toBe(-15);
  });
});
