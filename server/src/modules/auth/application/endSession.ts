import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { hashRefreshToken, invalidateSessionCache } from '../../../platform/identity/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { findSessionByTokenHash, revokeSession } from '../data/repo.js';

/** Sign out. Idempotent: signing out twice is not an error. */
export async function endSession(
  presentedToken: string | undefined,
  audit: AuditContext,
  clock: Clock = systemClock,
): Promise<void> {
  if (!presentedToken) return;

  const existing = await findSessionByTokenHash(hashRefreshToken(presentedToken));
  if (!existing || existing.revokedAt) return;

  await prisma.$transaction(async (tx) => {
    await revokeSession(tx, existing.id, { at: clock.now(), reason: 'signed-out' });

    await writeAudit(tx, {
      ...audit,
      action: 'session.revoke',
      entityType: 'RefreshSession',
      entityId: existing.id,
      after: { reason: 'signed-out' },
    });
  });
  // The signed-out token stops at once, not when its cache entry ages out (F03-009).
  invalidateSessionCache(existing.id);
}
