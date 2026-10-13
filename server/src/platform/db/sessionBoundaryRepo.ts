import type { PrismaTransactionClient } from './client.js';

/** Missing historical roots cannot be treated as a fresh family: the creation audit must prove the retained anchor. */
export async function originalSessionBoundary(tx: PrismaTransactionClient, input: { familyId: string; personId: string }) {
  const original = await tx.refreshSession.findFirst({ where: { familyId: input.familyId, volunteerId: input.personId },
    orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }], select: { id: true, issuedAt: true, expiresAt: true } });
  if (!original) return null;
  const proof = await tx.auditLog.findFirst({ where: { actorId: input.personId, action: 'session.create',
    entityType: 'RefreshSession', entityId: original.id, outcome: 'SUCCESS' }, select: { id: true } });
  return proof ? original : null;
}
