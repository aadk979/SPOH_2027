import type { MyAssignment } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toMyAssignment } from '../data/mappers.js';
import { findAssignmentById, markCheckedOut } from '../data/repo.js';
import { alreadyCheckedOut, assertCheckedIn, assertNotCheckedOut } from '../domain/shiftRules.js';
import { loadOwnShift } from './ownShift.js';

export async function checkOut(
  assignmentId: string,
  { volunteerId, scope, audit }: ActorContext,
  clock: Clock = systemClock,
): Promise<MyAssignment> {
  const assignment = await loadOwnShift(scope, { volunteerId, assignmentId });
  assertCheckedIn(assignment);
  assertNotCheckedOut(assignment);

  const now = clock.now();

  await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, scope);
    // Conditional, so two taps racing each other cannot both write (F03-015).
    if (!(await markCheckedOut(tx, scope, { id: assignmentId, at: now })))
      throw alreadyCheckedOut();

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
  const updated = await findAssignmentById(scope, assignmentId);
  if (!updated) throw new NotFoundError('Shift assignment');
  return toMyAssignment(updated);
}
