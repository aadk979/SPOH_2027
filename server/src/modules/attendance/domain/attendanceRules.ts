import type { AttendanceRecord } from '@spoh/shared';
import { ForbiddenError } from '../../../platform/errors/index.js';

/** How long a QR or PIN stays valid, and the window failed attempts count in. */
export const ATTENDANCE_TTL_MS = 5 * 60_000;
/** Failed attempts allowed per window before the person must wait. */
export const MAX_ATTEMPTS = 5;

export interface Person {
  id: string;
  email: string;
  role: string;
  active: boolean;
}

/** The one admin, named in configuration, who opens attendance each day. */
export function isRoot(person: Person, rootEmail: string | undefined): boolean {
  return person.active && person.role === 'ADMIN' && person.email.toLowerCase() === rootEmail;
}

export function assertActiveAccount(person: { active: boolean }): void {
  if (!person.active) throw new ForbiddenError('This account is inactive.');
}

/**
 * A verifier is an active admin or exco who is present today; a verifier who
 * opened attendance as root must still be the root.
 */
export function assertIssuerPresent<P extends Person>(
  issuer: P | null,
  presence: { method: AttendanceRecord['method'] } | null,
  rootEmail: string | undefined,
): asserts issuer is P {
  if (
    !rootEmail ||
    !issuer?.active ||
    issuer.role === 'VOLUNTEER' ||
    !presence ||
    (presence.method === 'ROOT' && !isRoot(issuer, rootEmail))
  ) {
    throw new ForbiddenError(
      'The verifier must be an active admin or exco with verified attendance today.',
    );
  }
}

/** An exco can verify others only once the current root has verified them. */
export function assertVerifiedByRoot(root: Person | null, rootEmail: string | undefined): void {
  if (!root || !isRoot(root, rootEmail))
    throw new ForbiddenError('Excos must first verify attendance through the current root admin.');
}

/** Failed attempts in the current window, and whether the person must wait. */
export function attemptWindow(
  attempts: { windowStart: Date; attempts: number } | null,
  now: Date,
): { sameWindow: boolean; exhausted: boolean } {
  const sameWindow =
    attempts !== null && now.getTime() - attempts.windowStart.getTime() < ATTENDANCE_TTL_MS;
  return { sameWindow, exhausted: sameWindow && attempts.attempts >= MAX_ATTEMPTS };
}

/** The challenge exists, is today's, has not expired, and matches the QR's claims. */
export function assertChallengeUsable<
  C extends { expiresAt: Date; eventDayId: string; issuerId: string },
>(
  challenge: C | null,
  claims: { issuerId: string; eventDayId: string } | null,
  { dayId, now }: { dayId: string; now: Date },
): asserts challenge is C {
  if (
    !challenge ||
    challenge.expiresAt <= now ||
    challenge.eventDayId !== dayId ||
    (claims && (claims.issuerId !== challenge.issuerId || claims.eventDayId !== dayId))
  ) {
    throw new ForbiddenError('This attendance code is invalid or expired. Ask for a fresh code.');
  }
}

/**
 * Who may verify whom: never yourself; an exco only through the root; a QR
 * only when both phones are on the campus network.
 */
export function assertMayVerify(input: {
  person: Person;
  issuer: Person;
  rootEmail: string | undefined;
  method: AttendanceRecord['method'];
  bothOnCampus: boolean;
}): void {
  const { person, issuer, rootEmail, method, bothOnCampus } = input;
  if (issuer.id === person.id) throw new ForbiddenError('You cannot verify your own attendance.');
  if (person.role !== 'VOLUNTEER' && !isRoot(issuer, rootEmail))
    throw new ForbiddenError('Excos must scan the root admin’s QR or enter their PIN.');
  if (method === 'QR' && !bothOnCampus) {
    throw new ForbiddenError(
      'Both phones must use the configured SP network for QR attendance. Ask your verifier for their secondary PIN instead.',
    );
  }
}
