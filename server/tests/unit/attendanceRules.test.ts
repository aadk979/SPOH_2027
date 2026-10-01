import { describe, expect, it } from 'vitest';
import {
  assertChallengeUsable,
  assertEventToday,
  assertIssuerPresent,
  assertMayVerify,
  assertVerifiedByRoot,
  attemptWindow,
  isRoot,
} from '../../src/modules/attendance/domain/attendanceRules.js';

/** Attendance rules (P06.7): who may verify whom, without a database. */

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

const ROOT_MEMBERSHIP_ID = 'root-member';
const root = { id: 'r', membershipId: ROOT_MEMBERSHIP_ID, role: 'ADMIN', active: true };
const exco = { id: 'e', membershipId: 'exco-member', role: 'IC', active: true };
const volunteer = { id: 'v', membershipId: 'volunteer-member', role: 'VOLUNTEER', active: true };
const now = new Date('2027-01-07T02:00:00.000Z');

describe('attendance rules', () => {
  it('knows the root by the configured event membership while active', () => {
    expect(isRoot(root, ROOT_MEMBERSHIP_ID)).toBe(true);
    expect(isRoot({ ...root, active: false }, ROOT_MEMBERSHIP_ID)).toBe(false);
    expect(isRoot(exco, ROOT_MEMBERSHIP_ID)).toBe(false);
    expect(isRoot(root, null)).toBe(false);
  });

  it('lets only a present admin or exco issue codes', () => {
    const present = { method: 'PIN' as const };
    expect(codeOf(() => assertIssuerPresent(exco, present, ROOT_MEMBERSHIP_ID))).toBeUndefined();
    expect(codeOf(() => assertIssuerPresent(exco, null, ROOT_MEMBERSHIP_ID))).toBe('FORBIDDEN');
    expect(codeOf(() => assertIssuerPresent(volunteer, present, ROOT_MEMBERSHIP_ID))).toBe(
      'FORBIDDEN',
    );
    expect(codeOf(() => assertIssuerPresent(exco, present, null))).toBe('FORBIDDEN');
    expect(codeOf(() => assertIssuerPresent(exco, { method: 'ROOT' }, ROOT_MEMBERSHIP_ID))).toBe(
      'FORBIDDEN',
    );
    expect(codeOf(() => assertVerifiedByRoot(exco, ROOT_MEMBERSHIP_ID))).toBe('FORBIDDEN');
    expect(codeOf(() => assertVerifiedByRoot(root, ROOT_MEMBERSHIP_ID))).toBeUndefined();
  });

  it('counts attempts in a five-minute window and stops the sixth', () => {
    expect(attemptWindow(null, now)).toEqual({ sameWindow: false, exhausted: false });
    const recent = { windowStart: new Date(now.getTime() - 60_000), attempts: 5 };
    expect(attemptWindow(recent, now)).toEqual({ sameWindow: true, exhausted: true });
    const old = { windowStart: new Date(now.getTime() - 6 * 60_000), attempts: 5 };
    expect(attemptWindow(old, now)).toEqual({ sameWindow: false, exhausted: false });
  });

  it("accepts only today's unexpired challenge, matching the QR's claims", () => {
    const today = { dayId: 'd', now };
    const challenge = { expiresAt: new Date(now.getTime() + 1), eventDayId: 'd', issuerId: 'e' };
    expect(codeOf(() => assertChallengeUsable(challenge, null, today))).toBeUndefined();
    expect(codeOf(() => assertChallengeUsable(null, null, today))).toBe('ATTENDANCE_CODE_INVALID');
    expect(codeOf(() => assertChallengeUsable({ ...challenge, expiresAt: now }, null, today))).toBe(
      'ATTENDANCE_CODE_INVALID',
    );
    const otherIssuer = { issuerId: 'x', eventDayId: 'd' };
    expect(codeOf(() => assertChallengeUsable(challenge, otherIssuer, today))).toBe(
      'ATTENDANCE_CODE_INVALID',
    );
  });

  it('refuses self-verification, an exco verified by a non-root, and QR off campus, as rules (F03-026)', () => {
    const base = {
      rootMembershipId: ROOT_MEMBERSHIP_ID,
      method: 'PIN' as const,
      bothOnCampus: false,
    };
    expect(codeOf(() => assertMayVerify({ ...base, person: exco, issuer: exco }))).toBe(
      'VERIFICATION_NOT_ALLOWED',
    );
    expect(
      codeOf(() => assertMayVerify({ ...base, person: exco, issuer: { ...exco, id: 'x' } })),
    ).toBe('VERIFICATION_NOT_ALLOWED');
    expect(
      codeOf(() => assertMayVerify({ ...base, person: volunteer, issuer: exco })),
    ).toBeUndefined();
    expect(
      codeOf(() => assertMayVerify({ ...base, method: 'QR', person: volunteer, issuer: exco })),
    ).toBe('QR_OFF_CAMPUS');
  });
});

describe('attendance days (F03-026)', () => {
  it('answers a day without an event as a conflict, not a permission denial', () => {
    expect(codeOf(() => assertEventToday(null))).toBe('NO_EVENT_TODAY');
    expect(codeOf(() => assertEventToday({ id: 'd' }))).toBeUndefined();
  });
});
