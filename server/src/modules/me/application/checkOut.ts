import type { MyAssignment } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toMyAssignment } from '../data/mappers.js';
import { findAssignmentById, markCheckedOut } from '../data/repo.js';
import { assertCheckedIn } from '../domain/shiftRules.js';
import { loadOwnShift } from './ownShift.js';

export async function checkOut(
  assignmentId: string,
  { volunteerId, audit }: ActorContext,
  clock: Clock = systemClock,
): Promise<MyAssignment> {
  const assignment = await loadOwnShift(volunteerId, assignmentId);
  assertCheckedIn(assignment);

  const now = clock.now();

  await prisma.$transaction(async (tx) => {
    await markCheckedOut(tx, assignmentId, now);

    await writeAudit(tx, {
      ...audit,
      action: 'shift.checkOut',
      entityType: 'ShiftAssignment',
      entityId: assignmentId,
      after: { checkedOutAt: now.toISOString() },
    });
  });

  // Loaded after commit: its relations would overlap on the transaction's
  // connection (F03-019).
  const updated = await findAssignmentById(assignmentId);
  if (!updated) throw new NotFoundError('Shift assignment');
  return toMyAssignment(updated);
}
