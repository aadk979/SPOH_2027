import type {
  UpdateVolunteerRequest,
  VolunteerAdminRecord,
  VolunteerMutationResponse,
} from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { logger } from '../../../platform/logger/index.js';
import { revokeAllForVolunteer } from '../../auth/index.js';
import { identityProvider } from '../../../platform/identity/index.js';
import { toAdminRecord } from '../data/mappers.js';
import { findManager, findManagerOf, updateVolunteerRow } from '../data/repo.js';
import { assertMayGrant, assertNoReportingCycle } from '../domain/escalation.js';
import type { ManagerContext } from './context.js';
import { loadTarget } from './queries.js';

async function assertValidManager(
  scope: EventScope,
  link: { volunteerId: string; managerId: string | undefined | null },
) {
  const { volunteerId, managerId } = link;
  if (!managerId) return;
  const manager = await findManager(scope, managerId);
  if (!manager?.active) throw new NotFoundError('Manager');
  await assertNoReportingCycle({ volunteerId, managerId }, (id) => findManagerOf(scope, id));
}

/** The patch as a change: name and phone are the person's, the rest the membership's. */
function toChange(id: string, patch: UpdateVolunteerRequest) {
  return {
    id,
    person: {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone ?? null } : {}),
    },
    membership: {
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.portfolio !== undefined ? { portfolio: patch.portfolio ?? null } : {}),
      ...(patch.reportsToId !== undefined ? { reportsToPersonId: patch.reportsToId ?? null } : {}),
    },
  };
}

/**
 * A role change is a change to what this person may do, so their existing
 * sessions must not outlive it: the capability list is baked into the client
 * at sign-in. The identity provider's groups are kept in step too; the roster
 * is authoritative, so a failure there is a reconciliation problem, not a
 * failed edit.
 */
async function afterRoleChange(updated: VolunteerAdminRecord): Promise<number> {
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
  await assertValidManager(actor.scope, { volunteerId: id, managerId: patch.reportsToId });
  const roleChanged = patch.role !== undefined && patch.role !== target.role;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await updateVolunteerRow(tx, actor.scope, toChange(id, patch));
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

  const volunteer = toAdminRecord(updated);
  const sessionsRevoked = roleChanged ? await afterRoleChange(volunteer) : 0;
  invalidateVolunteerCache();
  return { volunteer, sessionsRevoked, identityChanged: roleChanged };
}
