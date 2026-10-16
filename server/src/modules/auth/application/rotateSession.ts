import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { hashRefreshToken, invalidateSessionCache } from '../../../platform/identity/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { findSessionByTokenHash, touchVolunteer, revokeLiveSessions } from '../data/repo.js';
import { reuseDetected, sessionEnded } from '../domain/sessionRules.js';
import {
  issueSession,
  loadVolunteer,
  type OpenedSession,
  type SessionContext,
} from './issueSession.js';
import { inHomeEvent } from './sessionAudit.js';
import { rotateLocked } from './rotateLocked.js';
import { lockCredentialPerson } from '../data/securityRepo.js';
import { currentSessionLimit } from './currentSession.js';
import { lockSession } from '../data/rotationRepo.js';

/** Person precedes session locks on normal rotation and the bounded retry-grace path. */
export async function rotateSession(
  presentedToken: string,
  context: SessionContext,
  audit: AuditContext,
): Promise<OpenedSession> {
  const hash = hashRefreshToken(presentedToken);
  const initial = await findSessionByTokenHash(hash);
  if (!initial) throw sessionEnded();
  const recorded = await inHomeEvent(audit, initial.volunteerId);
  const result = await prisma.$transaction(async (tx) => {
    await lockCredentialPerson(tx, initial.volunteerId);
    await lockSession(tx, initial.id);
    const existing = await findSessionByTokenHash(hash, tx);
    if (!existing || existing.volunteer.cognitoSub !== initial.volunteer.cognitoSub)
      throw sessionEnded();
    const volunteer = await loadVolunteer(existing.volunteer.cognitoSub, tx);
    const now = systemClock.now();
    const expiresAt = await currentSessionLimit(tx, { session: existing, volunteer, now });
    const session = await rotateLocked(tx, existing.id, { now, expiresAt, ...context });
    if (session) {
      await touchVolunteer(tx, volunteer.scope, { id: volunteer.id, at: now });
      return { volunteer, session };
    }
    const count = await revokeLiveSessions(
      { familyId: existing.familyId },
      { at: now, reason: 'reuse-detected' },
      tx,
    );
    await writeAudit(tx, {
      ...recorded,
      actorId: existing.volunteerId,
      actorSub: existing.volunteer.cognitoSub,
      action: 'session.reuseDetected',
      entityType: 'RefreshSession',
      entityId: existing.id,
      after: { familyId: existing.familyId, sessionsRevoked: count },
    });
    return null;
  });
  invalidateSessionCache(result ? initial.id : undefined);
  if (!result) throw reuseDetected();
  return issueSession(result.volunteer, {
    sub: initial.volunteer.cognitoSub,
    sessionId: result.session.id,
    refreshToken: result.session.refreshToken,
    expiresAt: result.session.expiresAt,
  });
}
