import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { decryptProviderToken } from '../../../platform/identity/protectedTokens.js';
import { systemClock } from '../../../platform/time/index.js';
import { mfaSession, completeMfa } from '../data/securityRepo.js';
import { sessionEnded } from '../domain/sessionRules.js';
import { issueSession, loadVolunteer } from './issueSession.js';
import { inHomeEvent } from './sessionAudit.js';

async function restrictedSession(claims: { sid: string; sub: string }) {
  const session = await mfaSession(claims.sid);
  const now = systemClock.now();
  if (
    !session ||
    session.volunteer.cognitoSub !== claims.sub ||
    session.revokedAt ||
    !session.mfaPending ||
    !session.providerTokenEncrypted ||
    !session.providerTokenExpiresAt ||
    session.providerTokenExpiresAt <= now
  )
    throw sessionEnded();
  return { session, providerToken: decryptProviderToken(session.providerTokenEncrypted) };
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
  const volunteer = await loadVolunteer(claims.sub);
  const audit = await inHomeEvent(input.audit, volunteer.id);
  await prisma.$transaction(async (tx) => {
    await completeMfa(tx, session.id);
    await writeAudit(tx, {
      ...audit,
      actorId: volunteer.id,
      actorSub: claims.sub,
      action: 'session.mfaEnrolled',
      entityType: 'RefreshSession',
      entityId: session.id,
      after: { enrolled: true },
    });
  });
  return (
    await issueSession(volunteer, {
      sub: claims.sub,
      sessionId: session.id,
      refreshToken: '',
      expiresAt: session.expiresAt,
    })
  ).response;
}
