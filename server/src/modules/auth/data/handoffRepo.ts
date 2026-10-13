import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';

export function handoffSession(id: string, tx: PrismaTransactionClient = prisma) {
  return tx.refreshSession.findUnique({ where: { id }, include: { volunteer: { select: { cognitoSub: true } } } });
}
export function handoffById(id: string) { return prisma.authHandoff.findUnique({ where: { id } }); }
export async function lockHandoff(tx: PrismaTransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "AuthHandoff" WHERE id = ${id} FOR UPDATE`;
  return tx.authHandoff.findUnique({ where: { id } });
}
export async function consumeHandoff(tx: PrismaTransactionClient, input: { id: string; now: Date }) {
  const result = await tx.authHandoff.updateMany({ where: { id: input.id, consumedAt: null,
    expiresAt: { gt: input.now } }, data: { consumedAt: input.now } });
  return result.count === 1;
}

/** A recovery code cannot outlive a session deleted by pruning or revoked during issuance. */
export async function lockHandoffSession(tx: PrismaTransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "RefreshSession" WHERE id = ${id} FOR SHARE`;
  return tx.refreshSession.findUnique({
    where: { id },
    select: {
      revokedAt: true,
      expiresAt: true,
      absoluteExpiresAt: true,
      volunteerId: true,
      mfaPending: true,
      providerTokenEncrypted: true,
      providerTokenExpiresAt: true,
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
