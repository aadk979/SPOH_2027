import type { MyAssignment } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { toMyAssignment } from '../data/mappers.js';
import { markCheckedOut } from '../data/repo.js';
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

  return prisma.$transaction(async (tx) => {
    const updated = await markCheckedOut(tx, assignmentId, now);

    await writeAudit(tx, {
      ...audit,
      action: 'shift.checkOut',
      entityType: 'ShiftAssignment',
      entityId: assignmentId,
      after: { checkedOutAt: now.toISOString() },
    });

    return toMyAssignment(updated);
  });
}
