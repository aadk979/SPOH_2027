import type { VolunteerMutationResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { logger } from '../../../platform/logger/index.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { toAdminRecord } from '../data/mappers.js';
import { updateVolunteerRow } from '../data/repo.js';
import { assertActive } from '../domain/escalation.js';
import type { ManagerContext } from './context.js';
import { loadTarget } from './queries.js';

async function enableIdentity(target: { id: string; email: string }): Promise<boolean> {
  try {
    await identityProvider.enableUser(target.email);
    return true;
  } catch (error) {
    logger.error(
      { err: error, volunteerId: target.id },
      'volunteer reactivated on the roster but the identity provider account could not be re-enabled',
    );
    return false;
  }
}

/**
 * Restore access. Sessions are deliberately not restored: the volunteer signs
 * in again, which is what proves they still hold the credential.
 */
export async function reactivateVolunteer(
  id: string,
  actor: ManagerContext,
): Promise<VolunteerMutationResponse> {
  const target = await loadTarget(id, actor, 'reactivate');
  assertActive(target, false);

  const updated = await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, actor.scope);
    const row = await updateVolunteerRow(tx, actor.scope, {
      id,
      membership: { status: 'ACTIVE', deactivatedAt: null, deactivatedReason: null },
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.reactivate',
      entityType: 'Volunteer',
      entityId: id,
      before: { active: false, reason: target.deactivatedReason },
      after: { active: true },
    });
    return row;
  });

  const identityChanged = await enableIdentity(target);
  invalidateVolunteerCache();
  return { volunteer: toAdminRecord(updated), sessionsRevoked: 0, identityChanged };
}
