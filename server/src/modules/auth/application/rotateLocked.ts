import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { successorRefreshToken, matchingSuccessorRefreshToken } from '../../../platform/identity/protectedTokens.js';
import { hashRefreshToken } from '../../../platform/identity/sessionTokens.js';
import { sessionEnded } from '../domain/sessionRules.js';
import { lockSession, findReplacement, storeReplacement } from '../data/rotationRepo.js';
import type { RotationSession } from '../data/rotationRepo.js';

function withinGrace(previous: RotationSession, input: { now: Date; userAgent: string | null; ip: string | null }) {
  return previous.revokedAt !== null && previous.revokedReason === 'rotated' &&
    previous.replacedById !== null && input.now.getTime() - previous.revokedAt.getTime() <= 10_000 &&
    previous.userAgent === input.userAgent && previous.ip === input.ip;
}

export async function graceSuccessor(
  tx: PrismaTransactionClient,
  id: string,
  input: { now: Date; userAgent: string | null; ip: string | null },
) {
  const previous = await lockSession(tx, id);
  if (!withinGrace(previous, input)) return null;
  const next = await findReplacement(tx, previous.replacedById as string);
  if (!next || next.revokedAt || next.expiresAt <= input.now) throw sessionEnded();
  const refreshToken = matchingSuccessorRefreshToken(previous.id, next.tokenHash);
  if (!refreshToken) throw sessionEnded();
  return {
    id: next.id,
    expiresAt: next.expiresAt,
    refreshToken,
  };
}

export async function rotateLocked(
  tx: PrismaTransactionClient,
  id: string,
  input: { now: Date; expiresAt: Date; userAgent: string | null; ip: string | null },
) {
  const previous = await lockSession(tx, id);
  if (previous.revokedAt) return graceSuccessor(tx, id, input);
  const refreshToken = successorRefreshToken(id);
  const row = await storeReplacement(tx, {
    previous,
    ...input,
    tokenHash: hashRefreshToken(refreshToken),
  });
  return { ...row, expiresAt: input.expiresAt, refreshToken };
}
