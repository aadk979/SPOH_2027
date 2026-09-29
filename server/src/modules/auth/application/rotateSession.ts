import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { generateRefreshToken, hashRefreshToken } from '../../../platform/identity/index.js';
import { logger } from '../../../platform/logger/index.js';
import { getSettings } from '../../../platform/settings/index.js';
import { systemClock } from '../../../platform/time/index.js';
import {
  createRefreshSession,
  findSessionByTokenHash,
  revokeSession,
  touchVolunteer,
  type PresentedSession,
} from '../data/repo.js';
import {
  refreshExpiry,
  reuseDetected,
  rotationCheck,
  sessionEnded,
} from '../domain/sessionRules.js';
import {
  issueSession,
  loadVolunteer,
  type OpenedSession,
  type SessionContext,
} from './issueSession.js';
import { revokeFamily } from './revokeSessions.js';
import { inCurrentEvent } from './sessionAudit.js';

/**
 * Rotate a refresh token: look it up, detect reuse, revoke and replace it, and
 * issue a new access token.
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
  const existing = await findSessionByTokenHash(hashRefreshToken(presentedToken));
  if (!existing) throw sessionEnded();

  if (rotationCheck(existing, systemClock.now()) === 'reused') {
    await revokeReusedFamily(existing, audit);
    throw reuseDetected();
  }

  const volunteer = await loadVolunteer(existing.volunteer.cognitoSub);

  const nextToken = generateRefreshToken();
  const now = systemClock.now();
  const expiresAt = refreshExpiry(now, getSettings().refreshSessionDays);

  const session = await prisma.$transaction(async (tx) => {
    // Revoke first, inside the same transaction as the replacement, so the two
    // can never both be live.
    await revokeSession(tx, existing.id, { at: now, reason: 'rotated', lastUsedAt: now });

    const row = await createRefreshSession(tx, {
      volunteerId: volunteer.id,
      tokenHash: hashRefreshToken(nextToken),
      familyId: existing.familyId,
      userAgent: context.userAgent,
      ip: context.ip,
      expiresAt,
    });

    await touchVolunteer(tx, volunteer.scope, { id: volunteer.id, at: now });

    return row;
  });

  return issueSession(volunteer, {
    sub: existing.volunteer.cognitoSub,
    sessionId: session.id,
    refreshToken: nextToken,
    expiresAt,
  });
}

/**
 * A token that was already rotated is being presented a second time. Either
 * the cookie leaked or a client replayed it; there is no way to tell which
 * party is legitimate, so the whole family goes.
 */
async function revokeReusedFamily(existing: PresentedSession, audit: AuditContext): Promise<void> {
  const { count } = await revokeFamily(existing.familyId, 'reuse-detected');

  logger.error(
    { familyId: existing.familyId, volunteerId: existing.volunteerId, revoked: count },
    'refresh token reuse detected; revoked the entire session family',
  );

  const recorded = await inCurrentEvent(audit, existing.volunteerId);
  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      ...recorded,
      actorId: existing.volunteerId,
      actorSub: existing.volunteer.cognitoSub,
      action: 'session.reuseDetected',
      entityType: 'RefreshSession',
      entityId: existing.id,
      after: { familyId: existing.familyId, sessionsRevoked: count },
    });
  });
}
