import type { UpdateVolunteerRequest, VolunteerMutationResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { logger } from '../../../platform/logger/index.js';
import { revokeAllForVolunteer } from '../../auth/index.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { toAdminRecord } from '../data/mappers.js';
import { findManager, findManagerOf, updateVolunteerRow, type AdminRow } from '../data/repo.js';
import { assertMayGrant, assertNoReportingCycle } from '../domain/escalation.js';
import type { ManagerContext } from './context.js';
import { loadTarget } from './queries.js';

async function assertValidManager(volunteerId: string, managerId: string | undefined | null) {
  if (!managerId) return;
  const manager = await findManager(managerId);
  if (!manager?.active) throw new NotFoundError('Manager');
  await assertNoReportingCycle({ volunteerId, managerId }, findManagerOf);
}

function toUpdate(patch: UpdateVolunteerRequest) {
  return {
    ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone ?? null } : {}),
    ...(patch.role !== undefined ? { role: patch.role } : {}),
    ...(patch.portfolio !== undefined ? { portfolio: patch.portfolio ?? null } : {}),
    ...(patch.reportsToId !== undefined ? { reportsToId: patch.reportsToId ?? null } : {}),
  };
}

/**
 * A role change is a change to what this person may do, so their existing
 * sessions must not outlive it: the capability list is baked into the client
 * at sign-in. The identity provider's groups are kept in step too; the roster
 * is authoritative, so a failure there is a reconciliation problem, not a
 * failed edit.
 */
async function afterRoleChange(updated: AdminRow): Promise<number> {
  const sessionsRevoked = await revokeAllForVolunteer(updated.id, 'role-changed');
  try {
    await identityProvider.ensureUser({
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
    });
  } catch (error) {
    logger.error(
      { err: error, volunteerId: updated.id },
      'role changed on the roster but the identity provider group could not be updated',
    );
  }
  return sessionsRevoked;
}

export async function updateVolunteer(
  id: string,
  patch: UpdateVolunteerRequest,
  actor: ManagerContext,
): Promise<VolunteerMutationResponse> {
  const target = await loadTarget(id, actor, 'edit');
  assertMayGrant(actor.role, patch.role);
  await assertValidManager(id, patch.reportsToId);
  const roleChanged = patch.role !== undefined && patch.role !== target.role;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await updateVolunteerRow(tx, actor.scope, { id, data: toUpdate(patch) });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.update',
      entityType: 'Volunteer',
      entityId: id,
      before: {
        displayName: target.displayName,
        role: target.role,
        portfolio: target.portfolio,
        reportsToId: target.reportsToId,
      },
      after: { ...patch },
    });
    return row;
  });

  const sessionsRevoked = roleChanged ? await afterRoleChange(updated) : 0;
  invalidateVolunteerCache();
  return { volunteer: toAdminRecord(updated), sessionsRevoked, identityChanged: roleChanged };
}
