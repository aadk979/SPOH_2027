import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { revokeLiveSessions } from '../data/repo.js';

/** Revoke every live session in a family. Returns how many were live. */
export async function revokeFamily(
  familyId: string,
  reason: string,
  clock: Clock = systemClock,
): Promise<{ count: number }> {
  return { count: await revokeLiveSessions({ familyId }, { at: clock.now(), reason }) };
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
  return revokeLiveSessions({ volunteerId }, { at: clock.now(), reason });
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

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      ...audit,
      action: 'session.revoke',
      entityType: 'RefreshSession',
      entityId: sessionId,
      after: { reason: 'signed-out-remotely' },
    });
  });

  return true;
}
