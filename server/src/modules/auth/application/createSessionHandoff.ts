import { randomBytes } from 'node:crypto';
import { prisma } from '../../../platform/db/client.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { insertHandoff, lockHandoffSession } from '../data/handoffRepo.js';
import { sessionEnded } from '../domain/sessionRules.js';

/** Recheck after waiting, and hold the parent row through the foreign-key insert. */
export async function createSessionHandoff(
  input: { sessionId: string; sub: string; challenge: string },
  clock: Clock = systemClock,
): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  return prisma.$transaction(async (tx) => {
    const session = await lockHandoffSession(tx, input.sessionId);
    const now = clock.now();
    if (
      !session ||
      session.volunteer.cognitoSub !== input.sub ||
      session.revokedAt ||
      session.expiresAt <= now ||
      (session.absoluteExpiresAt && session.absoluteExpiresAt <= now)
    )
      throw sessionEnded();
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
