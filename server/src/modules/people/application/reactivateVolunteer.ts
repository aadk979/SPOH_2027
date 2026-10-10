import type { VolunteerMutationResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { toAdminRecord } from '../data/mappers.js';
import { updateVolunteerRow } from '../data/repo.js';
import type { ManagerContext } from './context.js';
import { loadTarget } from './queries.js';
import { currentManagement } from './currentManagement.js';

/**
 * Restore access. Sessions are deliberately not restored: the volunteer signs
 * in again, which is what proves they still hold the credential.
 */
export async function reactivateVolunteer(
  id: string,
  actor: ManagerContext,
): Promise<VolunteerMutationResponse> {
  const target = await loadTarget(id, actor, 'reactivate');

  const updated = await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, actor.scope);
    await currentManagement(tx, actor, { id, action: 'People.Deactivate' });
    const row = await updateVolunteerRow(tx, actor.scope, {
      id,
      membership: { status: 'ACTIVE', deactivatedAt: null, deactivatedReason: null },
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.reactivate',
      entityType: 'Volunteer',
      entityId: id,
      before: { active: false, reasonRecorded: Boolean(target.deactivatedReason) },
      after: { active: true },
    });
    return row;
  });

  invalidateVolunteerCache();
  return { volunteer: toAdminRecord(updated), sessionsRevoked: 0, identityChanged: false };
}
