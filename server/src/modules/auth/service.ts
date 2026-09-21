import {
  ERROR_CODES,
  capabilitiesForRole,
  type SessionResponse,
  type SessionSummary,
} from '@spoh/shared';
import { AppError, AccountInactiveError, NotProvisionedError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { getSettings } from '../../lib/settings.js';
import { writeAudit, type AuditContext } from '../../lib/audit.js';
import { invalidateVolunteerCache } from '../../middleware/auth/index.js';
import { generateRefreshToken, hashRefreshToken, issueAccessToken, newFamilyId } from './tokens.js';

/**
 * Session lifecycle: open, rotate, revoke.
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

export interface SessionContext {
  userAgent: string | null;
  ip: string | null;
}

/** Everything the client needs, plus the cookie value the router will set. */
export interface OpenedSession {
  response: SessionResponse;
  refreshToken: string;
  expiresAt: Date;
}

async function loadVolunteer(sub: string) {
  const volunteer = await prisma.volunteer.findUnique({
    where: { cognitoSub: sub },
    select: { id: true, displayName: true, role: true, active: true },
  });

  if (!volunteer) throw new NotProvisionedError();
  if (!volunteer.active) throw new AccountInactiveError();

  return volunteer;
}

/**
 * Open a session for an already-authenticated subject.
 *
 * The caller has verified the provider credential; this does not re-verify it.
 * It does re-check the roster, because being able to authenticate and being
 * allowed in are different questions (BUILD_PLAN §6.2).
 */
export async function openSession(
  sub: string,
  context: SessionContext,
  audit: AuditContext,
): Promise<OpenedSession> {
  const volunteer = await loadVolunteer(sub);

  const refreshToken = generateRefreshToken();
  const familyId = newFamilyId();
  const expiresAt = new Date(Date.now() + getSettings().refreshSessionDays * 86_400_000);

  const session = await prisma.$transaction(async (tx) => {
    const row = await tx.refreshSession.create({
      data: {
        volunteerId: volunteer.id,
        tokenHash: hashRefreshToken(refreshToken),
        familyId,
        userAgent: context.userAgent,
        ip: context.ip,
        expiresAt,
      },
      select: { id: true },
    });

    await tx.volunteer.update({
      where: { id: volunteer.id },
      data: { lastSeenAt: new Date() },
    });

    await writeAudit(tx, {
      ...audit,
      actorId: volunteer.id,
      actorSub: sub,
      action: 'session.create',
      entityType: 'RefreshSession',
      entityId: row.id,
      after: { userAgent: context.userAgent },
    });

    return row;
  });

  const { token, expiresIn } = await issueAccessToken({ sub, sid: session.id });

  return {
    refreshToken,
    expiresAt,
    response: {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      volunteer: {
        id: volunteer.id,
        displayName: volunteer.displayName,
        role: volunteer.role,
      },
      capabilities: capabilitiesForRole(volunteer.role),
      // Overwritten by the router if the cookie could not actually be set.
      refreshAvailable: true,
    },
  };
}

/**
 * Rotate a refresh token.
 *
 * Every failure mode returns the same generic outcome to the client — an
 * expired session — except detected reuse, which is worth distinguishing so the
 * client can stop retrying and the volunteer is told to sign in again rather
 * than sitting on a loop.
 */
export async function rotateSession(
  presentedToken: string,
  context: SessionContext,
  audit: AuditContext,
): Promise<OpenedSession> {
  const tokenHash = hashRefreshToken(presentedToken);

  const existing = await prisma.refreshSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      familyId: true,
      volunteerId: true,
      expiresAt: true,
      revokedAt: true,
      revokedReason: true,
      volunteer: { select: { cognitoSub: true, active: true } },
    },
  });

  if (!existing) {
    throw new AppError(401, ERROR_CODES.SESSION_EXPIRED, 'Your session has ended. Sign in again.');
  }

  /**
   * A token that was already rotated is being presented a second time. Either
   * the cookie leaked or a client replayed it; there is no way to tell which
   * party is legitimate, so the whole family goes.
   */
  if (existing.revokedAt) {
    const { count } = await revokeFamily(existing.familyId, 'reuse-detected');

    logger.error(
      { familyId: existing.familyId, volunteerId: existing.volunteerId, revoked: count },
      'refresh token reuse detected; revoked the entire session family',
    );

    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        ...audit,
        actorId: existing.volunteerId,
        actorSub: existing.volunteer.cognitoSub,
        action: 'session.reuseDetected',
        entityType: 'RefreshSession',
        entityId: existing.id,
        after: { familyId: existing.familyId, sessionsRevoked: count },
      });
    });

    throw new AppError(
      401,
      ERROR_CODES.SESSION_REUSE_DETECTED,
      'This session was ended for security reasons. Sign in again.',
    );
  }

  if (existing.expiresAt <= new Date()) {
    throw new AppError(401, ERROR_CODES.SESSION_EXPIRED, 'Your session has ended. Sign in again.');
  }

  if (!existing.volunteer.active) throw new AccountInactiveError();

  const volunteer = await loadVolunteer(existing.volunteer.cognitoSub);

  const nextToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + getSettings().refreshSessionDays * 86_400_000);
  const now = new Date();

  const session = await prisma.$transaction(async (tx) => {
    // Revoke first, inside the same transaction as the replacement, so the two
    // can never both be live.
    await tx.refreshSession.update({
      where: { id: existing.id },
      data: { revokedAt: now, revokedReason: 'rotated', lastUsedAt: now },
    });

    const row = await tx.refreshSession.create({
      data: {
        volunteerId: volunteer.id,
        tokenHash: hashRefreshToken(nextToken),
        familyId: existing.familyId,
        userAgent: context.userAgent,
        ip: context.ip,
        expiresAt,
      },
      select: { id: true },
    });

    await tx.volunteer.update({ where: { id: volunteer.id }, data: { lastSeenAt: now } });

    return row;
  });

  const { token, expiresIn } = await issueAccessToken({
    sub: existing.volunteer.cognitoSub,
    sid: session.id,
  });

  return {
    refreshToken: nextToken,
    expiresAt,
    response: {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      volunteer: {
        id: volunteer.id,
        displayName: volunteer.displayName,
        role: volunteer.role,
      },
      capabilities: capabilitiesForRole(volunteer.role),
      refreshAvailable: true,
    },
  };
}

/** Revoke every live session in a family. Returns how many were live. */
export async function revokeFamily(familyId: string, reason: string): Promise<{ count: number }> {
  return prisma.refreshSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** Sign out. Idempotent: signing out twice is not an error. */
export async function endSession(
  presentedToken: string | undefined,
  audit: AuditContext,
): Promise<void> {
  if (!presentedToken) return;

  const tokenHash = hashRefreshToken(presentedToken);
  const existing = await prisma.refreshSession.findUnique({
    where: { tokenHash },
    select: { id: true, volunteerId: true, revokedAt: true },
  });

  if (!existing || existing.revokedAt) return;

  await prisma.$transaction(async (tx) => {
    await tx.refreshSession.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokedReason: 'signed-out' },
    });

    await writeAudit(tx, {
      ...audit,
      action: 'session.revoke',
      entityType: 'RefreshSession',
      entityId: existing.id,
      after: { reason: 'signed-out' },
    });
  });
}

/**
 * Revoke every session a volunteer holds.
 *
 * Called when an admin deactivates or demotes someone. Without it, withdrawing
 * access would take effect only when their current access token expired, which
 * is exactly the wrong behaviour for "this person lost their phone".
 */
export async function revokeAllForVolunteer(volunteerId: string, reason: string): Promise<number> {
  const { count } = await prisma.refreshSession.updateMany({
    where: { volunteerId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });

  return count;
}

export async function listSessions(
  volunteerId: string,
  currentSessionId: string | null,
): Promise<SessionSummary[]> {
  const rows = await prisma.refreshSession.findMany({
    where: { volunteerId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      userAgent: true,
      issuedAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    issuedAt: row.issuedAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    current: row.id === currentSessionId,
  }));
}

/**
 * Revoke one named session — "sign out that other device".
 *
 * Scoped to the caller's own sessions, verified against the row rather than
 * trusted from the request, so one volunteer cannot sign another one out.
 */
export async function revokeOwnSession(
  volunteerId: string,
  sessionId: string,
  audit: AuditContext,
): Promise<boolean> {
  const { count } = await prisma.refreshSession.updateMany({
    where: { id: sessionId, volunteerId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'signed-out-remotely' },
  });

  if (count === 0) return false;

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      ...audit,
      action: 'session.revoke',
      entityType: 'RefreshSession',
      entityId: sessionId,
      after: { reason: 'signed-out-remotely' },
    });
  });

  return true;
}

/**
 * Housekeeping. Expired and long-revoked rows carry no value and the table is
 * written to on every refresh, so it is the one that grows fastest.
 */
export async function pruneRefreshSessions(now: Date = new Date()): Promise<number> {
  // Revoked rows are kept for a week: reuse detection needs to still recognise
  // a rotated token, and a same-day forensic question is worth answering.
  const revokedCutoff = new Date(now.getTime() - 7 * 86_400_000);

  const { count } = await prisma.refreshSession.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: revokedCutoff } }],
    },
  });

  if (count > 0) {
    invalidateVolunteerCache();
    logger.info({ removed: count }, 'pruned expired refresh sessions');
  }

  return count;
}
