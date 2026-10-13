import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { identityProvider, generateRefreshToken, hashRefreshToken, invalidateSessionCache } from '../../../platform/identity/index.js';
import { decryptProviderToken } from '../../../platform/identity/protectedTokens.js';
import { systemClock } from '../../../platform/time/index.js';
import { mfaSession, lockCredentialPerson } from '../data/securityRepo.js';
import { lockSession } from '../data/rotationRepo.js';
import { createRefreshSession, revokeLiveSessions } from '../data/repo.js';
import { sessionEnded } from '../domain/sessionRules.js';
import { issueSession, loadVolunteer } from './issueSession.js';
import { inHomeEvent } from './sessionAudit.js';
import { credentialIsCurrent, restrictedProviderIsCurrent, providerAuthenticationIsFresh } from '../domain/credentialRules.js';

async function restrictedSession(claims: { sid: string; sub: string }, tx: PrismaTransactionClient = prisma) {
  const session = await mfaSession(claims.sid, tx);
  const now = systemClock.now();
  if (
    !session ||
    session.volunteer.cognitoSub !== claims.sub ||
    session.volunteer.deactivatedAt || session.volunteer.piiErasedAt ||
    !providerAuthenticationIsFresh(session.authenticatedAt, now) ||
    !credentialIsCurrent(session, now) || !restrictedProviderIsCurrent(session, now)
  )
    throw sessionEnded();
  return { session, providerToken: decryptProviderToken(session.providerTokenEncrypted!) };
}

export async function beginMfa(claims: { sid: string; sub: string }) {
  const { providerToken } = await restrictedSession(claims);
  return { secretCode: await identityProvider.beginMfa(providerToken) };
}

export async function verifyMfa(
  claims: { sid: string; sub: string },
  input: { code: string; audit: AuditContext },
) {
  const { session, providerToken } = await restrictedSession(claims);
  await identityProvider.verifyMfa({ accessToken: providerToken, code: input.code });
  const audit = await inHomeEvent(input.audit, session.volunteerId);
  const completed = await prisma.$transaction(async (tx) => {
    await lockCredentialPerson(tx, session.volunteerId);
    await lockSession(tx, session.id);
    const current = await restrictedSession(claims, tx);
    const volunteer = await loadVolunteer(claims.sub, tx);
    if (!(await identityProvider.hasMfa(volunteer.email, claims.sub))) throw sessionEnded();
    const fresh = await promoteMfaSession(tx, current.session);
    await writeAudit(tx, {
      ...audit,
      actorId: volunteer.id,
      actorSub: claims.sub,
      action: 'session.mfaEnrolled',
      entityType: 'RefreshSession',
      entityId: fresh.id,
      after: { enrolled: true, replacedSessionId: session.id },
    });
    return { volunteer, fresh };
  }, { timeout: 30_000 });
  invalidateSessionCache(session.id);
  return issueSession(completed.volunteer, {
      sub: claims.sub,
      sessionId: completed.fresh.id,
      refreshToken: completed.fresh.refreshToken,
      expiresAt: completed.fresh.expiresAt,
    });
}

/** A restricted SID remains terminal forever, even when its bearer token is still unexpired. */
async function promoteMfaSession(tx: PrismaTransactionClient,
  session: NonNullable<Awaited<ReturnType<typeof mfaSession>>>) {
  const now = systemClock.now();
  if (!credentialIsCurrent(session, now) || !restrictedProviderIsCurrent(session, now)) throw sessionEnded();
  const refreshToken = generateRefreshToken();
  const fresh = await createRefreshSession(tx, { volunteerId: session.volunteerId,
    familyId: session.familyId, tokenHash: hashRefreshToken(refreshToken), userAgent: session.userAgent,
    ip: session.ip, expiresAt: session.expiresAt, absoluteExpiresAt: session.absoluteExpiresAt ?? session.expiresAt,
    authenticatedAt: session.authenticatedAt, issuedAt: now });
  await revokeLiveSessions({ id: session.id, volunteerId: session.volunteerId }, { at: now, reason: 'mfa-completed' }, tx);
  return { id: fresh.id, expiresAt: session.expiresAt, refreshToken };
}
