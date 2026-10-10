import type { PrismaTransactionClient } from '../../../platform/db/client.js';

/** A recovery code cannot outlive a session deleted by pruning or revoked during issuance. */
export async function lockHandoffSession(tx: PrismaTransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "RefreshSession" WHERE id = ${id} FOR SHARE`;
  return tx.refreshSession.findUnique({
    where: { id },
    select: {
      revokedAt: true,
      expiresAt: true,
      absoluteExpiresAt: true,
      volunteer: { select: { cognitoSub: true } },
    },
  });
}

export async function insertHandoff(
  tx: PrismaTransactionClient,
  data: { id: string; sessionId: string; challenge: string; expiresAt: Date },
) {
  return tx.authHandoff.create({ data });
}
