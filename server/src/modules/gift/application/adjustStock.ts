import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { AdjustGiftStockRequest, GiftTypeRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toGiftTypeRecord } from '../data/mappers.js';
import { createAdjustment, findGiftType, totalsForGiftType, lockGiftType } from '../data/repo.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { queueLowStockNotice } from './notifyLowStock.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';

/** A stock correction: a delivery, a breakage, a recount. Audited with the before state. */
export async function adjustStock(
  giftTypeId: string,
  request: AdjustGiftStockRequest & { idempotencyKey?: string; expectedRehearsal?: boolean },
  actor: ActorContext & { membershipId: string; clock?: Clock },
): Promise<GiftTypeRecord> {
  return prisma.$transaction(async (tx) => {
    const { scope } = actor;
    await captureProvenance(tx, scope, request.expectedRehearsal === undefined ? undefined
      : { rehearsal: request.expectedRehearsal });
    await tx.$queryRaw`SELECT id FROM "EventMembership" WHERE "eventId" = ${scope.eventId}
      AND id = ${actor.membershipId} AND "personId" = ${actor.volunteerId} FOR SHARE`;
    if (request.idempotencyKey) await lockReserved(tx, scope, request.idempotencyKey);
    await lockGiftType(tx, scope, giftTypeId);
    const giftType = await findGiftType(scope, giftTypeId, tx);
    if (!giftType) throw new NotFoundError('Gift type');
    await requireCurrentPermission(tx, { scope, personId: actor.volunteerId,
      membershipId: actor.membershipId, action: 'Count.Adjust', resource: { type: 'GiftType', id: giftTypeId } });
    const before = await totalsForGiftType(tx, scope, giftTypeId);

    const adjustment = await createAdjustment(tx, scope, {
      giftTypeId,
      delta: request.delta,
      reason: request.reason,
      createdById: actor.volunteerId,
      createdByMembershipId: actor.membershipId,
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'gift.adjust',
      entityType: 'GiftType',
      entityId: giftTypeId,
      before: { adjustment: before.adjustment },
      after: { delta: request.delta, reason: request.reason, rehearsal: before.rehearsal },
    });

    const result = toGiftTypeRecord(giftType, await totalsForGiftType(tx, scope, giftTypeId));
    const initial = before.rehearsal ? giftType.rehearsalInitialStock : giftType.initialStock;
    await queueLowStockNotice(tx, scope, { gift: result,
      beforeRemaining: initial + before.adjustment - before.redeemed,
      transitionId: adjustment.id, transitionType: 'ADJUSTMENT', now: (actor.clock ?? systemClock).now() });
    if (request.idempotencyKey) await settleReserved(tx, scope, { key: request.idempotencyKey,
      statusCode: 200, body: { giftType: result } });
    return result;
  });
}
