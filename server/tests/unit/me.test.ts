import { describe, expect, it } from 'vitest';
import {
  assertCheckedIn,
  assertNotCheckedIn,
  assertNotCheckedOut,
  assertOwnShift,
  isRunningNow,
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

  it('does not count a shift on another day as running', () => {
    const shift = {
      eventDay: { date: new Date('2027-01-08T00:00:00.000Z') },
      block: 'MORNING' as const,
    };
    expect(isRunningNow(shift, new Date('2027-01-07T02:00:00.000Z'))).toBe(false);
  });
});
