import type { MyAssignment } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toMyAssignment } from '../data/mappers.js';
import { findAssignmentInTx, hasAttendance, markCheckedIn } from '../data/repo.js';
import { assertNotCheckedIn, isRunningNow } from '../domain/shiftRules.js';
import { loadOwnShift } from './ownShift.js';

/**
 * Shift check-in. Gives Lead Facilitators live attendance instead of counting
 * heads (PRODUCT_BRIEF §6.1).
 */
export async function checkIn(
  assignmentId: string,
  { volunteerId, audit }: ActorContext,
  clock: Clock = systemClock,
): Promise<MyAssignment> {
  const assignment = await loadOwnShift(volunteerId, assignmentId);
  assertNotCheckedIn(assignment);

  const now = clock.now();

  return prisma.$transaction(async (tx) => {
    const present = await hasAttendance(tx, { volunteerId, eventDayId: assignment.eventDayId });
    if (!present || !isRunningNow(assignment, now)) {
      throw new ForbiddenError(
        'Submit verified attendance for today before checking into a current shift.',
      );
    }
    if (!(await markCheckedIn(tx, { id: assignmentId, volunteerId }, now)))
      throw new ForbiddenError('This shift has changed. Refresh your shift list.');
    const updated = await findAssignmentInTx(tx, assignmentId);

    await writeAudit(tx, {
      ...audit,
      action: 'shift.checkIn',
      entityType: 'ShiftAssignment',
      entityId: assignmentId,
      after: { checkedInAt: now.toISOString() },
    });

    return toMyAssignment(updated);
  });
}
