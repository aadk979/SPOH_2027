import type { PrismaTransactionClient } from '../../../platform/db/client.js';

export async function lockSession(tx: PrismaTransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "RefreshSession" WHERE id = ${id} FOR UPDATE`;
  return tx.refreshSession.findUniqueOrThrow({ where: { id } });
}
export type RotationSession = Awaited<ReturnType<typeof lockSession>>;
export function findReplacement(tx: PrismaTransactionClient, id: string) {
  return tx.refreshSession.findUnique({ where: { id } });
}
export async function storeReplacement(
  tx: PrismaTransactionClient,
  input: {
    previous: RotationSession;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  },
) {
  const row = await tx.refreshSession.create({
    data: {
      volunteerId: input.previous.volunteerId,
      familyId: input.previous.familyId,
      tokenHash: input.tokenHash,
      userAgent: input.userAgent,
      ip: input.ip,
      expiresAt: input.expiresAt,
      lastUsedAt: input.now,
      absoluteExpiresAt: input.previous.absoluteExpiresAt,
    },
    select: { id: true },
  });
  await tx.refreshSession.updateMany({
    where: { id: input.previous.id, revokedAt: null },
    data: {
      revokedAt: input.now,
      revokedReason: 'rotated',
      lastUsedAt: input.now,
      replacedById: row.id,
    },
  });
  return row;
}
