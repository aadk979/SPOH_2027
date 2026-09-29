import type { DeactivateVolunteerRequest, VolunteerMutationResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { logger } from '../../../platform/logger/index.js';
import { revokeAllForVolunteer } from '../../auth/index.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { toAdminRecord } from '../data/mappers.js';
import { deletePushSubscriptions, updateVolunteerRow } from '../data/repo.js';
import { assertActive } from '../domain/escalation.js';
import type { ManagerContext } from './context.js';
import { loadTarget } from './queries.js';

/**
 * The roster flag already blocks every request, so access is withdrawn either
 * way; a provider failure means somebody needs to know it is out of step.
 */
async function disableIdentity(target: { id: string; email: string }): Promise<boolean> {
  try {
    await identityProvider.disableUser(target.email);
    return true;
  } catch (error) {
    logger.error(
      { err: error, volunteerId: target.id },
      'volunteer deactivated on the roster but the identity provider account could not be disabled',
    );
    return false;
  }
}

/**
 * Withdraw access. Three things happen together or the account is only half
 * locked out: the roster row is flagged, every refresh session is revoked, and
 * the identity provider account is disabled.
 */
export async function deactivateVolunteer(
  id: string,
  request: DeactivateVolunteerRequest,
  actor: ManagerContext,
): Promise<VolunteerMutationResponse> {
  const target = await loadTarget(id, actor, 'deactivate');
  assertActive(target, true);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await updateVolunteerRow(tx, actor.scope, {
      id,
      data: { active: false, deactivatedAt: now, deactivatedReason: request.reason },
    });
    await deletePushSubscriptions(tx, id);
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.deactivate',
      entityType: 'Volunteer',
      entityId: id,
      before: { active: true },
      after: { active: false, reason: request.reason, disableIdentity: request.disableIdentity },
    });
    return row;
  });

  const sessionsRevoked = await revokeAllForVolunteer(id, 'deactivated');
  const identityChanged = request.disableIdentity ? await disableIdentity(target) : false;
  invalidateVolunteerCache();
  return { volunteer: toAdminRecord(updated), sessionsRevoked, identityChanged };
}
