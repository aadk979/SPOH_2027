import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { verifyRevocationProof } from '../../../platform/identity/sessionTokens.js';
import { prisma } from '../../../platform/db/client.js';
import { revokeLiveSessions } from '../data/repo.js';
import { inHomeEvent } from './sessionAudit.js';
import { invalidateSessionCache } from '../../../platform/identity/index.js';
import { systemClock } from '../../../platform/time/index.js';

/** The bearer path is for third-party-cookie-blocked clients and is idempotent. */
export async function signOutAccessSession(token: string | undefined, audit: AuditContext) {
  if (!token) return;
  const claims = await verifyRevocationProof(token);
  if (!claims) return;
  await prisma.$transaction(async (tx) => {
    const session = await tx.refreshSession.findFirst({ where: { id: claims.sid,
      volunteer: { cognitoSub: claims.sub } } });
    if (!session) return;
    const recorded = await inHomeEvent(audit, session.volunteerId);
    const revoked = await revokeLiveSessions({ familyId: session.familyId },
      { at: systemClock.now(), reason: 'signed-out' }, tx);
    if (revoked) await writeAudit(tx, { ...recorded, actorId: session.volunteerId,
      actorSub: claims.sub, action: 'session.revoke', entityType: 'RefreshSession',
      entityId: session.id, after: { reason: 'signed-out', familySessions: revoked } });
  });
  invalidateSessionCache();
}
