import { randomBytes } from 'node:crypto';
import { prisma } from '../../../platform/db/client.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { insertHandoff, lockHandoffSession, handoffSession } from '../data/handoffRepo.js';
import { sessionEnded } from '../domain/sessionRules.js';
import { lockCredentialPerson } from '../data/securityRepo.js';
import { loadVolunteer } from './issueSession.js';
import { currentSessionLimit } from './currentSession.js';
import { credentialIsCurrent, restrictedProviderIsCurrent } from '../domain/credentialRules.js';

/** Recheck after waiting, and hold the parent row through the foreign-key insert. */
export async function createSessionHandoff(
  input: { sessionId: string; sub: string; challenge: string },
  clock: Clock = systemClock,
): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  const initial = await handoffSession(input.sessionId);
  if (!initial) throw sessionEnded();
  return prisma.$transaction(async (tx) => {
    await lockCredentialPerson(tx, initial.volunteerId);
    const volunteer = await loadVolunteer(input.sub, tx);
    const session = await lockHandoffSession(tx, input.sessionId);
    const now = clock.now();
    if (
      !session ||
      session.volunteer.cognitoSub !== input.sub ||
      !credentialIsCurrent(session, now)
    )
      throw sessionEnded();
    if (session.mfaPending && !restrictedProviderIsCurrent(session, now)) throw sessionEnded();
    if (!session.mfaPending) {
      const current = await handoffSession(input.sessionId, tx);
      if (!current) throw sessionEnded();
      await currentSessionLimit(tx, { session: current, volunteer, now });
    }
    await insertHandoff(tx, {
      id,
      sessionId: input.sessionId,
      challenge: input.challenge,
      expiresAt: new Date(Math.min(
        now.getTime() + 60_000,
        session.expiresAt.getTime(),
        session.absoluteExpiresAt?.getTime() ?? Infinity,
      )),
    });
    return id;
  });
}
