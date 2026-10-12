import { ERROR_CODES, type WithdrawSwapRequest } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { AppError, NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { cancelOwnPendingSwap, ownSwapForWithdrawal } from '../data/withdrawSwapRepo.js';
import { assertSwapPending } from '../domain/swapRules.js';
import { withdrawalNoticeParticipants } from '../data/noticeSourceRepo.js';
import { queueNotices } from '../../notification/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';

export async function withdrawSwap(
  input: { id: string; body: WithdrawSwapRequest },
  actor: ActorContext & { clock?: Clock },
) {
  return prisma.$transaction(async (tx) => {
    const event = await holdCaptureEvent(tx, actor.scope);
    if (event.status === 'ARCHIVED') throw new ValidationError('Archived events are read only.');
    await requireCurrentPermission(tx, {
      scope: actor.scope,
      membershipId: actor.membershipId,
      personId: actor.volunteerId,
      action: 'Self.Read',
      resource: { type: 'Membership', id: actor.membershipId },
    });
    await lockReserved(tx, actor.scope, input.body.idempotencyKey);
    const target = { id: input.id, requesterId: actor.volunteerId };
    const swap = await ownSwapForWithdrawal(tx, actor.scope, target);
    if (!swap) throw new NotFoundError('Your swap request');
    assertSwapPending(swap);
    const participants = await withdrawalNoticeParticipants(actor.scope, { tx, id: input.id });
    if (!(await cancelOwnPendingSwap(tx, actor.scope, target)))
      throw new AppError(409, ERROR_CODES.SWAP_NOT_PENDING, 'This swap has already been decided');
    await writeAudit(tx, {
      ...actor.audit,
      action: 'swap.withdraw',
      entityType: 'ShiftSwapRequest',
      entityId: input.id,
      before: { status: 'REQUESTED' },
      after: { status: 'CANCELLED' },
    });
    if (participants) await queueNotices(tx, actor.scope, { kind: 'SWAP_CANCELLED', priority: 'OPERATIONAL',
      source: { kind: 'SWAP', id: input.id }, transitionKey: `swap:${input.id}:CANCELLED`,
      context: { type: 'swap' }, recipientPersonIds: [participants.requesterId, participants.targetId],
      createdAt: (actor.clock ?? systemClock).now() });
    const response = { data: { id: input.id, status: 'CANCELLED' as const } };
    await settleReserved(tx, actor.scope, {
      key: input.body.idempotencyKey,
      statusCode: 200,
      body: response,
    });
    return response;
  });
}
