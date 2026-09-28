import { ERROR_CODES, type MyAssignment } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toMyAssignment } from '../data/mappers.js';
import { findAssignmentById, hasAttendance, markCheckedIn } from '../data/repo.js';
import { assertNotCheckedIn, assertPresentToday, assertRunningNow } from '../domain/shiftRules.js';
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

  await prisma.$transaction(async (tx) => {
    const present = await hasAttendance(tx, { volunteerId, eventDayId: assignment.eventDayId });
    assertPresentToday(present);
    assertRunningNow(assignment, now);
    if (!(await markCheckedIn(tx, { id: assignmentId, volunteerId }, now)))
      throw new ConflictError(
        ERROR_CODES.CONFLICT,
        'This shift has changed. Refresh your shift list.',
      );

    await writeAudit(tx, {
      ...audit,
      action: 'shift.checkIn',
      entityType: 'ShiftAssignment',
      entityId: assignmentId,
      after: { checkedInAt: now.toISOString() },
    });
  });

  // Loaded after commit: its relations would overlap on the transaction's
  // connection (F03-019).
  const updated = await findAssignmentById(assignmentId);
  if (!updated) throw new NotFoundError('Shift assignment');
  return toMyAssignment(updated);
}
