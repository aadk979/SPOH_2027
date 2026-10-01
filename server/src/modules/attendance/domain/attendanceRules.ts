import { ERROR_CODES, type AttendanceRecord } from '@spoh/shared';
import { ConflictError, ForbiddenError, RuleError } from '../../../platform/errors/index.js';

/** How long a QR or PIN stays valid, and the window failed attempts count in. */
export const ATTENDANCE_TTL_MS = 5 * 60_000;
/** Failed attempts allowed per window before the person must wait. */
export const MAX_ATTEMPTS = 5;

export interface Person {
  id: string;
  membershipId: string;
  role: string;
  active: boolean;
}

/** The event member chosen as root, if still an active admin. */
export function isRoot(person: Person, rootMembershipId: string | null): boolean {
  return person.active && person.role === 'ADMIN' && person.membershipId === rootMembershipId;
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
  rootMembershipId: string | null,
): asserts issuer is P {
  if (
    !rootMembershipId ||
    !issuer?.active ||
    issuer.role === 'VOLUNTEER' ||
    !presence ||
    (presence.method === 'ROOT' && !isRoot(issuer, rootMembershipId))
  ) {
    throw new ForbiddenError(
      'The verifier must be an active admin or exco with verified attendance today.',
    );
  }
}

/** An exco can verify others only once the current root has verified them. */
export function assertVerifiedByRoot(root: Person | null, rootMembershipId: string | null): void {
  if (!root || !isRoot(root, rootMembershipId))
    throw new ForbiddenError('Excos must first verify attendance through the current root admin.');
}

/**
 * The code cannot be used: wrong, expired, rotated, another day's, or issued by
 * someone who can no longer verify. A rule on valid input, not a permission
 * (F03-026).
 */
export function codeInvalid(message: string): RuleError {
  return new RuleError(ERROR_CODES.ATTENDANCE_CODE_INVALID, message);
}

/** Attendance happens on a configured event day; any other day is a 409 (F03-026). */
export function assertEventToday<D>(day: D | null): asserts day is D {
  if (!day)
    throw new ConflictError(ERROR_CODES.NO_EVENT_TODAY, 'Today is not a configured event day.');
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
    throw codeInvalid('This attendance code is invalid or expired. Ask for a fresh code.');
  }
}

/**
 * Who may verify whom: never yourself; an exco only through the root; a QR
 * only when both phones are on the campus network.
 */
export function assertMayVerify(input: {
  person: Person;
  issuer: Person;
  rootMembershipId: string | null;
  method: AttendanceRecord['method'];
  bothOnCampus: boolean;
}): void {
  const { person, issuer, rootMembershipId, method, bothOnCampus } = input;
  if (issuer.id === person.id)
    throw new RuleError(
      ERROR_CODES.VERIFICATION_NOT_ALLOWED,
      'You cannot verify your own attendance.',
    );
  if (person.role !== 'VOLUNTEER' && !isRoot(issuer, rootMembershipId))
    throw new RuleError(
      ERROR_CODES.VERIFICATION_NOT_ALLOWED,
      'Excos must scan the root admin’s QR or enter their PIN.',
    );
  if (method === 'QR' && !bothOnCampus) {
    throw new RuleError(
      ERROR_CODES.QR_OFF_CAMPUS,
      'Both phones must use the configured SP network for QR attendance. Ask your verifier for their secondary PIN instead.',
    );
  }
}
