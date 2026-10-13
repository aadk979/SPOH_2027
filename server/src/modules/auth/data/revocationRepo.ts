import type { PrismaTransactionClient } from '../../../platform/db/client.js';

export async function lockRevocationSessions(tx: PrismaTransactionClient, ids: readonly string[]) {
  const ordered = [...new Set(ids)].sort();
  await tx.$queryRaw`SELECT id FROM "RefreshSession" WHERE id = ANY(${ordered}::text[]) ORDER BY id FOR UPDATE`;
}
export function currentRevocationSession(tx: PrismaTransactionClient, input: { id: string; personId: string }) {
  return tx.refreshSession.findFirst({ where: { id: input.id, volunteerId: input.personId },
    select: { revokedAt: true, expiresAt: true, absoluteExpiresAt: true, authenticatedAt: true, mfaPending: true,
      volunteer: { select: { deactivatedAt: true, piiErasedAt: true } } } });
}
