import type { CreateSwapRequest, SwapRequestRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toSwapRecord } from '../data/mappers.js';
import {
  createSwap,
  findAssignmentForSwap,
  findSwapById,
  findVolunteerActive,
  hasAssignmentOnShift,
} from '../data/repo.js';
import { assertNotSelf, assertOwnShift, assertTargetFree } from '../domain/swapRules.js';

/** Ask to give a shift to someone else; an IC decides. */
export async function requestSwap(
  request: CreateSwapRequest,
  { volunteerId: requesterId, scope, audit }: ActorContext,
): Promise<SwapRequestRecord> {
  const swap = await prisma.$transaction(async (tx) => {
    const assignment = await findAssignmentForSwap(tx, scope, request.assignmentId);
    if (!assignment) throw new NotFoundError('Shift assignment');
    assertOwnShift(assignment, requesterId);
    assertNotSelf(request.targetVolunteerId, requesterId);

    const target = await findVolunteerActive(tx, scope, request.targetVolunteerId);
    if (!target?.active) throw new NotFoundError('Volunteer');
    // Caught here rather than at approval so the requester finds out now,
    // while there is still time to ask somebody else.
    assertTargetFree(
      await hasAssignmentOnShift(tx, scope, {
        volunteerId: target.id,
        shiftId: assignment.shiftId,
      }),
      'That volunteer is already working this shift. Ask someone else.',
    );

    const row = await createSwap(tx, scope, {
      assignmentId: assignment.id,
      requesterId,
      targetId: target.id,
      reason: request.reason ?? null,
    });
    await writeAudit(tx, {
      ...audit,
      // Its own action: a request was audited as a decision (F03-018).
      action: 'swap.request',
      entityType: 'ShiftSwapRequest',
      entityId: row.id,
      after: { status: 'REQUESTED', assignmentId: assignment.id, targetId: target.id },
    });
    return row;
  });

  // Loaded after commit: the record's relations would overlap on the
  // transaction's connection (F03-019).
  const created = await findSwapById(scope, swap.id);
  if (!created) throw new NotFoundError('Swap request');
  return toSwapRecord(created);
}
