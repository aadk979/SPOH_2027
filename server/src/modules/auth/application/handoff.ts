import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { env } from '../../../config/env.js';
import { systemClock } from '../../../platform/time/index.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { sessionEnded } from '../domain/sessionRules.js';
import { rotateSession } from './rotateSession.js';
import { issueSession, loadVolunteer, type SessionContext } from './issueSession.js';
import { findSessionByTokenHash } from '../data/repo.js';
import { hashRefreshToken } from '../../../platform/identity/sessionTokens.js';
import { clientSignInOrigin } from './hostedSignIn.js';
import { createSessionHandoff } from './createSessionHandoff.js';

export function recoveryTarget(input: { returnTo: unknown; challenge: unknown; state: unknown }) {
  if (
    typeof input.returnTo !== 'string' ||
    typeof input.challenge !== 'string' ||
    typeof input.state !== 'string'
  )
    throw new ValidationError('A return address, challenge and state are required');
  let url: URL;
  try {
    url = new URL(input.returnTo);
  } catch {
    throw new ValidationError('Invalid return address');
  }
  if (
    !trustedReturnTo(url) ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.challenge) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(input.state)
  )
    throw new ValidationError('Invalid session recovery request');
  return { url, challenge: input.challenge, state: input.state };
}

function trustedReturnTo(url: URL) {
  const allowed = clientSignInOrigin() || env.CORS_ALLOWED_ORIGINS[0];
  return url.origin === allowed && !url.hash && !url.username && !url.password;
}

export async function recoverSession(
  token: string,
  input: { challenge: string },
  context: SessionContext & { audit: AuditContext },
) {
  const existing = await findSessionByTokenHash(hashRefreshToken(token));
  const opened =
    existing?.mfaPending && !existing.revokedAt && existing.expiresAt > systemClock.now()
      ? await issueSession(await loadVolunteer(existing.volunteer.cognitoSub), {
          sub: existing.volunteer.cognitoSub,
          sessionId: existing.id,
          refreshToken: token,
          expiresAt: existing.expiresAt,
          mfaPending: true,
        })
      : await rotateSession(token, context, context.audit);
  const { verifyAccessToken } = await import('../../../platform/identity/sessionTokens.js');
  const claims = await verifyAccessToken(opened.response.accessToken);
  if (!claims) throw sessionEnded();
  const id = await createSessionHandoff({
    sessionId: claims.sid,
    sub: claims.sub,
    challenge: input.challenge,
  });
  return { opened, code: id };
}

export async function redeemHandoff(input: { code: string; verifier: string }) {
  const handoff = await prisma.authHandoff.findUnique({ where: { id: input.code } });
  const now = systemClock.now();
  if (!handoff || handoff.consumedAt || handoff.expiresAt <= now) throw sessionEnded();
  const challenge = createHash('sha256').update(input.verifier).digest('base64url');
  if (
    challenge.length !== handoff.challenge.length ||
    !timingSafeEqual(Buffer.from(challenge), Buffer.from(handoff.challenge))
  )
    throw sessionEnded();
  const session = await prisma.refreshSession.findUnique({
    where: { id: handoff.sessionId },
    include: { volunteer: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) throw sessionEnded();
  const consumed = await prisma.authHandoff.updateMany({
    where: { id: handoff.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (!consumed.count) throw sessionEnded();
  const volunteer = await loadVolunteer(session.volunteer.cognitoSub);
  return (
    await issueSession(volunteer, {
      sub: session.volunteer.cognitoSub,
      sessionId: session.id,
      refreshToken: '',
      expiresAt: session.expiresAt,
      mfaPending: session.mfaPending,
    })
  ).response;
}
