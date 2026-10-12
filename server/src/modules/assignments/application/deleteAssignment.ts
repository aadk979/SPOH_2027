import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { deleteAssignmentRow } from '../data/repo.js';
import { assignmentForRemoval } from '../data/changeRepo.js';
import { assertNotWorked } from '../domain/assignmentRules.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { queueAssignmentNotice } from './queueAssignmentNotice.js';

export async function deleteAssignment(id: string, actor: ActorContext & { clock?: Clock }): Promise<void> {
  const { scope, audit } = actor;
  await prisma.$transaction(async (tx) => {
    const event = await holdCaptureEvent(tx, scope);
    if (event.status === 'ARCHIVED') throw new ValidationError('Archived rosters are read only.');
    await requireCurrentPermission(tx, { scope, personId: actor.volunteerId, membershipId: actor.membershipId,
      action: 'Roster.Edit', resource: { type: 'Event', id: scope.eventId },
      ...(actor.clock ? { clock: actor.clock } : {}) });
    const existing = await assignmentForRemoval(tx, scope, id);
    if (!existing) throw new NotFoundError('Shift assignment');
    assertNotWorked(existing);
    await deleteAssignmentRow(tx, scope, id);
    await writeAudit(tx, {
      ...audit,
      action: 'assignment.delete',
      entityType: 'ShiftAssignment',
      entityId: id,
      before: { ...existing },
    });
    await queueAssignmentNotice(tx, scope, { ...existing, operation: 'REMOVED', now: (actor.clock ?? systemClock).now() });
  });
}
