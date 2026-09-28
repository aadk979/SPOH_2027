import { describe, expect, it } from 'vitest';
import {
  assertChallengeUsable,
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

const ROOT_EMAIL = 'root@spoh.test';
const root = { id: 'r', email: 'Root@spoh.test', role: 'ADMIN', active: true };
const exco = { id: 'e', email: 'exco@spoh.test', role: 'IC', active: true };
const volunteer = { id: 'v', email: 'v@spoh.test', role: 'VOLUNTEER', active: true };
const now = new Date('2027-01-07T02:00:00.000Z');

describe('attendance rules', () => {
  it('knows the root by the configured email, case-insensitively, while active', () => {
    expect(isRoot(root, ROOT_EMAIL)).toBe(true);
    expect(isRoot({ ...root, active: false }, ROOT_EMAIL)).toBe(false);
    expect(isRoot(exco, ROOT_EMAIL)).toBe(false);
    expect(isRoot(root, undefined)).toBe(false);
  });

  it('lets only a present admin or exco issue codes', () => {
    const present = { method: 'PIN' as const };
    expect(codeOf(() => assertIssuerPresent(exco, present, ROOT_EMAIL))).toBeUndefined();
    expect(codeOf(() => assertIssuerPresent(exco, null, ROOT_EMAIL))).toBe('FORBIDDEN');
    expect(codeOf(() => assertIssuerPresent(volunteer, present, ROOT_EMAIL))).toBe('FORBIDDEN');
    expect(codeOf(() => assertIssuerPresent(exco, present, undefined))).toBe('FORBIDDEN');
    expect(codeOf(() => assertIssuerPresent(exco, { method: 'ROOT' }, ROOT_EMAIL))).toBe(
      'FORBIDDEN',
    );
    expect(codeOf(() => assertVerifiedByRoot(exco, ROOT_EMAIL))).toBe('FORBIDDEN');
    expect(codeOf(() => assertVerifiedByRoot(root, ROOT_EMAIL))).toBeUndefined();
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
    expect(codeOf(() => assertChallengeUsable(null, null, today))).toBe('FORBIDDEN');
    expect(codeOf(() => assertChallengeUsable({ ...challenge, expiresAt: now }, null, today))).toBe(
      'FORBIDDEN',
    );
    const otherIssuer = { issuerId: 'x', eventDayId: 'd' };
    expect(codeOf(() => assertChallengeUsable(challenge, otherIssuer, today))).toBe('FORBIDDEN');
  });

  it('refuses self-verification, an exco verified by a non-root, and QR off campus', () => {
    const base = { rootEmail: ROOT_EMAIL, method: 'PIN' as const, bothOnCampus: false };
    expect(codeOf(() => assertMayVerify({ ...base, person: exco, issuer: exco }))).toBe(
      'FORBIDDEN',
    );
    expect(
      codeOf(() => assertMayVerify({ ...base, person: exco, issuer: { ...exco, id: 'x' } })),
    ).toBe('FORBIDDEN');
    expect(
      codeOf(() => assertMayVerify({ ...base, person: volunteer, issuer: exco })),
    ).toBeUndefined();
    expect(
      codeOf(() => assertMayVerify({ ...base, method: 'QR', person: volunteer, issuer: exco })),
    ).toBe('FORBIDDEN');
  });
});
