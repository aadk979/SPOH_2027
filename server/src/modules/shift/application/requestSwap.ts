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
  hasAssignmentInBlock,
} from '../data/repo.js';
import { assertNotSelf, assertOwnShift, assertTargetFree } from '../domain/swapRules.js';

/** Ask to give a shift to someone else; an IC decides. */
export async function requestSwap(
  request: CreateSwapRequest,
  { volunteerId: requesterId, audit }: ActorContext,
): Promise<SwapRequestRecord> {
  const swap = await prisma.$transaction(async (tx) => {
    const assignment = await findAssignmentForSwap(tx, request.assignmentId);
    if (!assignment) throw new NotFoundError('Shift assignment');
    assertOwnShift(assignment, requesterId);
    assertNotSelf(request.targetVolunteerId, requesterId);

    const target = await findVolunteerActive(tx, request.targetVolunteerId);
    if (!target?.active) throw new NotFoundError('Volunteer');
    // Caught here rather than at approval so the requester finds out now,
    // while there is still time to ask somebody else.
    assertTargetFree(
      await hasAssignmentInBlock(tx, {
        volunteerId: target.id,
        eventDayId: assignment.eventDayId,
        block: assignment.block,
      }),
      'That volunteer is already working this block. Ask someone else.',
    );

    const row = await createSwap(tx, {
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
  const created = await findSwapById(swap.id);
  if (!created) throw new NotFoundError('Swap request');
  return toSwapRecord(created);
}
