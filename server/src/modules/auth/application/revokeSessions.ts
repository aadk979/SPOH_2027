import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { invalidateSessionCache } from '../../../platform/identity/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { revokeLiveSessions } from '../data/repo.js';
import { inHomeEvent } from './sessionAudit.js';

/** Revoke every live session in a family. Returns how many were live. */
export async function revokeFamily(
  familyId: string,
  reason: string,
  clock: Clock = systemClock,
): Promise<{ count: number }> {
  const count = await revokeLiveSessions({ familyId }, { at: clock.now(), reason });
  forgetRevoked();
  return { count };
}

/**
 * Revoke every session a volunteer holds.
 *
 * Called when an admin deactivates or demotes someone. Without it, withdrawing
 * access would take effect only when their current access token expired, which
 * is exactly the wrong behaviour for "this person lost their phone".
 */
export async function revokeAllForVolunteer(
  volunteerId: string,
  reason: string,
  clock: Clock = systemClock,
): Promise<number> {
  const count = await revokeLiveSessions({ volunteerId }, { at: clock.now(), reason });
  forgetRevoked();
  return count;
}

/**
 * Requests check a session's liveness through a short cache, so a revoke must
 * drop what it revoked or the access token keeps working for up to a minute
 * (F03-009). A family or a person's sessions are not listed by id here, so the
 * whole cache goes: it holds liveness only, refilled by one query per active
 * session. Other instances need the P10.3 cache bus.
 */
function forgetRevoked(sessionId?: string): void {
  invalidateSessionCache(sessionId);
}

/**
 * Revoke one named session — "sign out that other device".
 *
 * Scoped to the caller's own sessions, verified against the row rather than
 * trusted from the request, so one volunteer cannot sign another one out.
 */
export async function revokeOwnSession(
  volunteerId: string,
  sessionId: string,
  audit: AuditContext,
): Promise<boolean> {
  const count = await revokeLiveSessions(
    { id: sessionId, volunteerId },
    { at: systemClock.now(), reason: 'signed-out-remotely' },
  );

  if (count === 0) return false;
  forgetRevoked(sessionId);

  const recorded = await inHomeEvent(audit, volunteerId);
  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      ...recorded,
      action: 'session.revoke',
      entityType: 'RefreshSession',
      entityId: sessionId,
      after: { reason: 'signed-out-remotely' },
    });
  });

  return true;
}
