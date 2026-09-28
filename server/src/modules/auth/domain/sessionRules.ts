import { ERROR_CODES } from '@spoh/shared';
import { AccountInactiveError, AppError } from '../../../platform/errors/index.js';

/**
 * Session lifecycle rules.
 *
 * The refresh token is opaque, stored only as a SHA-256, and rotated on every
 * use. Rotation is what makes a long-lived credential in a cookie acceptable:
 * a stolen token is usable exactly once, and the moment the legitimate holder
 * refreshes, the theft becomes visible.
 *
 * `familyId` is how it becomes visible. Every rotation issues a new row in the
 * same family and revokes the previous one, so presenting an already-rotated
 * token means two parties hold tokens from one family — the cookie leaked. The
 * response is to revoke the entire family, not just that token, because there
 * is no way to tell which of the two parties is the attacker.
 */

const DAY_MS = 86_400_000;

/**
 * Revoked rows are kept for a week: reuse detection needs to still recognise
 * a rotated token, and a same-day forensic question is worth answering.
 */
export const REVOKED_RETENTION_MS = 7 * DAY_MS;

export function refreshExpiry(now: Date, sessionDays: number): Date {
  return new Date(now.getTime() + sessionDays * DAY_MS);
}

export function sessionEnded(): AppError {
  return new AppError(401, ERROR_CODES.SESSION_EXPIRED, 'Your session has ended. Sign in again.');
}

export function reuseDetected(): AppError {
  return new AppError(
    401,
    ERROR_CODES.SESSION_REUSE_DETECTED,
    'This session was ended for security reasons. Sign in again.',
  );
}

/**
 * Whether a presented refresh token may be rotated. A revoked one has already
 * been rotated once, so presenting it again is reuse: the caller revokes the
 * family. Every other failure is the same generic "session ended", so the
 * client cannot probe which check failed.
 */
export function rotationCheck(
  session: { revokedAt: Date | null; expiresAt: Date; volunteer: { active: boolean } },
  now: Date,
): 'reused' | 'ok' {
  if (session.revokedAt) return 'reused';
  if (session.expiresAt <= now) throw sessionEnded();
  if (!session.volunteer.active) throw new AccountInactiveError();
  return 'ok';
}
