import type { CreateAssignmentRequest, ShiftAssignmentRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { toAssignmentRecord } from '../data/mappers.js';
import { findAssignmentWithNames } from '../data/repo.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { assignmentTargets, upsertAssignmentChange } from '../data/changeRepo.js';
import { queueAssignmentNotice } from './queueAssignmentNotice.js';

async function currentTargets(tx: PrismaTransactionClient, scope: EventScope, request: CreateAssignmentRequest) {
  const { member, station, shift } = await assignmentTargets(tx, scope, request);
  if (member?.status !== 'ACTIVE' || member.person.deactivatedAt) throw new NotFoundError('Volunteer');
  if (!station?.active) throw new NotFoundError('Station');
  if (!shift) throw new NotFoundError('Shift');
  return { shift };
}

/**
 * Roster a volunteer onto a shift. Upsert rather than fail on the (volunteer,
 * shift) key, because "move them to the other station" is the operation an IC
 * actually wants.
 */
export async function createAssignment(
  request: CreateAssignmentRequest,
  actor: ActorContext & { clock?: Clock },
): Promise<ShiftAssignmentRecord> {
  const { scope, audit } = actor;
  const row = await prisma.$transaction(async (tx) => {
    const event = await holdCaptureEvent(tx, scope);
    if (event.status === 'ARCHIVED') throw new ValidationError('Archived rosters are read only.');
    await requireCurrentPermission(tx, { scope, personId: actor.volunteerId, membershipId: actor.membershipId,
      action: 'Roster.Edit', resource: { type: 'Event', id: scope.eventId },
      ...(actor.clock ? { clock: actor.clock } : {}) });
    const { shift } = await currentTargets(tx, scope, request);
    // A move is audited as one, with where the person was before (F03-018).
    const assignment = await upsertAssignmentChange(tx, scope, {
      volunteerId: request.volunteerId,
      stationId: request.stationId,
      eventDayId: shift.eventDayId,
      shiftId: request.shiftId,
      roleLabel: request.roleLabel,
    });
    if (!assignment.changed) return assignment;
    const { previous } = assignment;
    await writeAudit(tx, {
      ...audit,
      action: previous ? 'assignment.move' : 'assignment.create',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
      ...(previous ? { before: { ...previous } } : {}),
      after: {
        volunteerId: request.volunteerId,
        stationId: request.stationId,
        shiftId: request.shiftId,
      },
    });
    await queueAssignmentNotice(tx, scope, { ...request, eventDayId: shift.eventDayId,
      id: assignment.id, operation: previous ? 'MOVED' : 'ADDED', now: (actor.clock ?? systemClock).now() });
    return assignment;
  });

  // Loaded after commit: its relations would overlap on the transaction's
  // connection (F03-019).
  const assignment = await findAssignmentWithNames(scope, row.id);
  if (!assignment) throw new NotFoundError('Shift assignment');
  return toAssignmentRecord(assignment);
}
