import type {
  UpdateVolunteerRequest,
  VolunteerMutationResponse,
} from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { invalidatePersonCredentials } from '../../auth/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { toAdminRecord } from '../data/mappers.js';
import { findManager, findManagerOf, updateVolunteerRow } from '../data/repo.js';
import { assertMayGrant, assertNoReportingCycle } from '../domain/escalation.js';
import type { ManagerContext } from './context.js';
import { loadTarget } from './queries.js';
import { currentManagement } from './currentManagement.js';
import { holdReportingEvent, requireReportingLine } from '../../../platform/db/reportingLine.js';

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
 * sessions must not outlive it. Permissions remain database-derived; a new
 * sign-in also makes the person review the changed event access.
 */
export async function updateVolunteer(
  id: string,
  patch: UpdateVolunteerRequest,
  actor: ManagerContext,
): Promise<VolunteerMutationResponse> {
  await loadTarget(id, actor, 'edit');
  assertMayGrant(actor.role, patch.role);
  await assertValidManager(actor.scope, { volunteerId: id, managerId: patch.reportsToId });

  const updated = await prisma.$transaction(async (tx) => {
    if (patch.reportsToId !== undefined) await holdReportingEvent(tx, actor.scope);
    await holdCaptureEvent(tx, actor.scope);
    const target = await currentManagement(tx, actor, { id, action: 'People.Update' });
    if (patch.role)
      await currentManagement(tx, actor, { id, action: 'People.AssignRole', role: patch.role });
    if (patch.reportsToId) await requireReportingLine(tx, actor.scope, { personId: id, managerId: patch.reportsToId });
    const row = await updateVolunteerRow(tx, actor.scope, toChange(id, patch));
    const sessionsRevoked = patch.role !== undefined && patch.role !== target.role
      ? await invalidatePersonCredentials(tx, { personId: id, reason: 'role-changed', at: systemClock.now() }) : 0;
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.update',
      entityType: 'Volunteer',
      entityId: id,
      before: {
        role: target.role,
        portfolio: target.portfolio,
        reportsToId: target.reportsToId,
      },
      after: { changedFields: Object.keys(patch).filter((key) => key !== 'idempotencyKey'),
        ...(patch.role ? { role: patch.role } : {}),
        ...(patch.reportsToId !== undefined ? { reportsToId: patch.reportsToId } : {}) },
    });
    return { row, sessionsRevoked };
  });

  const volunteer = toAdminRecord(updated.row);
  invalidateVolunteerCache();
  return { volunteer, sessionsRevoked: updated.sessionsRevoked, identityChanged: false };
}
