import type { CreateAssignmentRequest, ShiftAssignmentRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toAssignmentRecord } from '../data/mappers.js';
import {
  findAssignmentInSlot,
  findAssignmentTargets,
  findAssignmentWithNames,
  upsertAssignmentRow,
} from '../data/repo.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/**
 * Roster a volunteer onto a shift. Upsert rather than fail on the (volunteer,
 * shift) key, because "move them to the other station" is the operation an IC
 * actually wants.
 */
export async function createAssignment(
  request: CreateAssignmentRequest,
  { scope, audit }: ActorContext,
): Promise<ShiftAssignmentRecord> {
  const { volunteer, station, shift } = await findAssignmentTargets(scope, request);
  if (!volunteer?.active) throw new NotFoundError('Volunteer');
  if (!station?.active) throw new NotFoundError('Station');
  if (!shift) throw new NotFoundError('Shift');

  const row = await prisma.$transaction(async (tx) => {
    // A move is audited as one, with where the person was before (F03-018).
    const previous = await findAssignmentInSlot(tx, scope, {
      volunteerId: request.volunteerId,
      shiftId: request.shiftId,
    });
    const assignment = await upsertAssignmentRow(tx, scope, {
      volunteerId: request.volunteerId,
      stationId: request.stationId,
      eventDayId: shift.eventDayId,
      shiftId: request.shiftId,
      roleLabel: request.roleLabel,
    });
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
    return assignment;
  });

  // Loaded after commit: its relations would overlap on the transaction's
  // connection (F03-019).
  const assignment = await findAssignmentWithNames(scope, row.id);
  if (!assignment) throw new NotFoundError('Shift assignment');
  return toAssignmentRecord(assignment);
}
