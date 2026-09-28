import type { DecideSwapRequest, SwapRequestRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toSwapRecord } from '../data/mappers.js';
import {
  claimDecision,
  findSwapById,
  findSwapForDecision,
  hasAssignmentInBlock,
  moveAssignment,
  type SwapForDecision,
} from '../data/repo.js';
import { assertStillRequesters, assertSwapPending, assertTargetFree } from '../domain/swapRules.js';
import { ERROR_CODES } from '@spoh/shared';
import { AppError } from '../../../platform/errors/index.js';

/**
 * Approving moves the assignment and clears the check-in state — the new
 * person has not arrived yet, and inheriting someone else's check-in would
 * make the attendance view lie.
 */
async function approve(tx: PrismaTransactionClient, swap: SwapForDecision) {
  assertStillRequesters(swap);
  // Re-checked at approval: the target may have picked up another shift in the
  // time between the request and the decision.
  assertTargetFree(
    await hasAssignmentInBlock(tx, {
      volunteerId: swap.targetId,
      eventDayId: swap.assignment.eventDayId,
      block: swap.assignment.block,
    }),
    'That volunteer has since been assigned to this block. The swap cannot be approved.',
  );
  await moveAssignment(tx, { assignmentId: swap.assignmentId, targetId: swap.targetId });
}
/** An IC approves or rejects a swap request. */
export async function decideSwap(
  swapId: string,
  request: DecideSwapRequest,
  { volunteerId: deciderId, audit }: ActorContext,
): Promise<SwapRequestRecord> {
  await prisma.$transaction(async (tx) => {
    const swap = await findSwapForDecision(tx, swapId);
    if (!swap) throw new NotFoundError('Swap request');
    assertSwapPending(swap);

    const claimed = await claimDecision(tx, {
      swapId,
      status: request.decision,
      decidedById: deciderId,
    });
    if (!claimed) {
      throw new AppError(409, ERROR_CODES.SWAP_NOT_PENDING, 'This swap has already been decided');
    }
    if (request.decision === 'APPROVED') await approve(tx, swap);

    await writeAudit(tx, {
      ...audit,
      action: 'swap.decide',
      entityType: 'ShiftSwapRequest',
      entityId: swapId,
      before: { status: swap.status },
      after: { status: request.decision, note: request.note ?? null },
    });
  });

  const refreshed = await findSwapById(swapId);
  if (!refreshed) throw new NotFoundError('Swap request');
  return toSwapRecord(refreshed);
}
