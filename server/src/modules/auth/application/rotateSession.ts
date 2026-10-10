import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { hashRefreshToken } from '../../../platform/identity/index.js';
import { logger } from '../../../platform/logger/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { findSessionByTokenHash, touchVolunteer, type PresentedSession } from '../data/repo.js';
import { refreshExpiry, reuseDetected, sessionEnded } from '../domain/sessionRules.js';
import { refreshSessionDays } from './sessionLifetime.js';
import {
  issueSession,
  loadVolunteer,
  type OpenedSession,
  type SessionContext,
} from './issueSession.js';
import { revokeFamily } from './revokeSessions.js';
import { inHomeEvent } from './sessionAudit.js';
import { rotateLocked, graceSuccessor } from './rotateLocked.js';
import { personNeedsMfa } from '../data/securityRepo.js';
import { adminSetting } from './sessionSecurity.js';

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

  const now = systemClock.now();
  const volunteer = await loadVolunteer(existing.volunteer.cognitoSub);
  await assertSessionLimits(existing, { volunteer, now });
  if (existing.revokedAt) {
    const grace = await prisma.$transaction((tx) =>
      graceSuccessor(tx, existing.id, { now, ...context }),
    );
    if (grace)
      return issueSession(volunteer, {
        sub: existing.volunteer.cognitoSub,
        sessionId: grace.id,
        ...grace,
      });
    await revokeReusedFamily(existing, audit);
    throw reuseDetected();
  }
  const expiresAt =
    existing.absoluteExpiresAt ?? refreshExpiry(now, await refreshSessionDays(volunteer.scope));
  const session = await prisma.$transaction(async (tx) => {
    const row = await rotateLocked(tx, existing.id, { now, expiresAt, ...context });
    await touchVolunteer(tx, volunteer.scope, { id: volunteer.id, at: now });
    return row;
  });
  if (!session) {
    await revokeReusedFamily(existing, audit);
    throw reuseDetected();
  }
  return issueSession(volunteer, {
    sub: existing.volunteer.cognitoSub,
    sessionId: session.id,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  });
}

async function assertSessionLimits(
  existing: PresentedSession,
  input: { volunteer: Awaited<ReturnType<typeof loadVolunteer>>; now: Date },
) {
  const { volunteer, now } = input;
  if (existing.mfaPending || existing.expiresAt <= now) throw sessionEnded();
  if (!(await personNeedsMfa(volunteer.id))) return;
  const idleMs = (await adminSetting(volunteer.scope, 'security.adminIdleMinutes')) * 60_000;
  if (
    (existing.absoluteExpiresAt && existing.absoluteExpiresAt <= now) ||
    now.getTime() - (existing.lastUsedAt ?? existing.issuedAt).getTime() >= idleMs
  )
    throw sessionEnded();
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

  const recorded = await inHomeEvent(audit, existing.volunteerId);
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
