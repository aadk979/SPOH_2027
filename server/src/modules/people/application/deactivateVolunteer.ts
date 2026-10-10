import type { DeactivateVolunteerRequest, VolunteerMutationResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { invalidateVolunteerCache } from '../../../platform/identity/index.js';
import { revokeAllInTransaction } from '../../auth/index.js';
import { toAdminRecord } from '../data/mappers.js';
import {
  deletePushSubscriptions,
  hasOtherActiveMembership,
  updateVolunteerRow,
} from '../data/repo.js';
import type { ManagerContext } from './context.js';
import { loadTarget } from './queries.js';
import { currentManagement } from './currentManagement.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';

/** Event suspension never disables a person's identity in their other events (ADR-006 §5). */
export async function deactivateVolunteer(
  id: string,
  request: DeactivateVolunteerRequest,
  actor: ManagerContext & { clock?: Clock },
): Promise<VolunteerMutationResponse> {
  await loadTarget(id, actor, 'deactivate');
  const now = (actor.clock ?? systemClock).now();
  const result = await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, actor.scope);
    await currentManagement(tx, actor, { id, action: 'People.Deactivate' });
    const row = await updateVolunteerRow(tx, actor.scope, {
      id,
      membership: { status: 'DEACTIVATED', deactivatedAt: now, deactivatedReason: request.reason },
    });
    const otherActive = await hasOtherActiveMembership(tx, {
      personId: id,
      eventId: actor.scope.eventId,
    });
    const sessionsRevoked = otherActive
      ? 0
      : await revokeAllInTransaction(tx, { personId: id, reason: 'deactivated', at: now });
    if (!otherActive) await deletePushSubscriptions(tx, id);
    await writeAudit(tx, {
      ...actor.audit,
      action: 'user.deactivate',
      entityType: 'Volunteer',
      entityId: id,
      after: { status: 'DEACTIVATED', reasonRecorded: true, sessionsRevoked },
    });
    return { row, sessionsRevoked };
  });
  invalidateVolunteerCache();
  return {
    volunteer: toAdminRecord(result.row),
    sessionsRevoked: result.sessionsRevoked,
    identityChanged: false,
  };
}
