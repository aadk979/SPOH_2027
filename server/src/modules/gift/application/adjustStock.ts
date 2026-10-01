import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { AdjustGiftStockRequest, GiftTypeRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toGiftTypeRecord } from '../data/mappers.js';
import { createAdjustment, findGiftType, totalsForGiftType, lockGiftType } from '../data/repo.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/** A stock correction: a delivery, a breakage, a recount. Audited with the before state. */
export async function adjustStock(
  giftTypeId: string,
  request: AdjustGiftStockRequest,
  actor: ActorContext & { membershipId: string },
): Promise<GiftTypeRecord> {
  return prisma.$transaction(async (tx) => {
    const { scope } = actor;
    await captureProvenance(tx, scope);
    await lockGiftType(tx, scope, giftTypeId);
    const giftType = await findGiftType(scope, giftTypeId, tx);
    if (!giftType) throw new NotFoundError('Gift type');
    const before = await totalsForGiftType(tx, scope, giftTypeId);

    await createAdjustment(tx, scope, {
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

    return toGiftTypeRecord(giftType, await totalsForGiftType(tx, scope, giftTypeId));
  });
}
