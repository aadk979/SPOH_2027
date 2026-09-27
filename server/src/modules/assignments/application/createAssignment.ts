import type { CreateAssignmentRequest, ShiftAssignmentRecord } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toAssignmentRecord } from '../data/mappers.js';
import { findAssignmentTargets, upsertAssignmentRow } from '../data/repo.js';

/**
 * Roster a volunteer into a block. Upsert rather than fail on the (volunteer,
 * day, block) key, because "move them to the other station" is the operation
 * an IC actually wants.
 */
export async function createAssignment(
  request: CreateAssignmentRequest,
  audit: AuditContext,
): Promise<ShiftAssignmentRecord> {
  const { volunteer, station, eventDay } = await findAssignmentTargets(request);
  if (!volunteer?.active) throw new NotFoundError('Volunteer');
  if (!station?.active) throw new NotFoundError('Station');
  if (!eventDay) throw new NotFoundError('Event day');

  const row = await prisma.$transaction(async (tx) => {
    const assignment = await upsertAssignmentRow(tx, {
      volunteerId: request.volunteerId,
      stationId: request.stationId,
      eventDayId: request.eventDayId,
      block: request.block,
      roleLabel: request.roleLabel,
    });
    await writeAudit(tx, {
      ...audit,
      action: 'assignment.create',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
      after: {
        volunteerId: request.volunteerId,
        stationId: request.stationId,
        block: request.block,
      },
    });
    return assignment;
  });

  return toAssignmentRecord(row);
}
