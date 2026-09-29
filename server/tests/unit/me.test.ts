import { describe, expect, it } from 'vitest';
import {
  assertCheckedIn,
  assertNotCheckedIn,
  assertNotCheckedOut,
  assertOwnShift,
  assertPresentToday,
  assertRunningNow,
} from '../../src/modules/me/domain/shiftRules.js';

/** Check-in rules (P06.7), without a database. */

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('check-in rules', () => {
  it('lets a volunteer check only their own shift in and out', () => {
    expect(codeOf(() => assertOwnShift({ volunteerId: 'a' }, 'b'))).toBe('FORBIDDEN');
    expect(codeOf(() => assertOwnShift({ volunteerId: 'a' }, 'a'))).toBeUndefined();
  });

  it('checks in once, and out once, only after checking in (F03-015)', () => {
    const at = new Date('2027-01-07T01:00:00.000Z');
    expect(codeOf(() => assertNotCheckedIn({ checkedInAt: at }))).toBe('ALREADY_CHECKED_IN');
    expect(codeOf(() => assertNotCheckedIn({ checkedInAt: null }))).toBeUndefined();
    expect(codeOf(() => assertCheckedIn({ checkedInAt: null }))).toBe('NOT_CHECKED_IN');
    expect(codeOf(() => assertCheckedIn({ checkedInAt: at }))).toBeUndefined();
    expect(codeOf(() => assertNotCheckedOut({ checkedOutAt: at }))).toBe('ALREADY_CHECKED_OUT');
    expect(codeOf(() => assertNotCheckedOut({ checkedOutAt: null }))).toBeUndefined();
  });

  it('reports check-in preconditions as conflicts, not permission denials (F03-026)', () => {
    expect(codeOf(() => assertPresentToday(false))).toBe('ATTENDANCE_REQUIRED');
    expect(codeOf(() => assertPresentToday(true))).toBeUndefined();
    expect(codeOf(() => assertRunningNow(false))).toBe('NOT_ON_SHIFT');
    expect(codeOf(() => assertRunningNow(true))).toBeUndefined();
  });
});
