import type { AdjustGiftStockRequest, GiftTypeRecord } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toGiftTypeRecord } from '../data/mappers.js';
import { createAdjustment, findGiftType, totalsForGiftType } from '../data/repo.js';

/** A stock correction: a delivery, a breakage, a recount. Audited with the before state. */
export async function adjustStock(
  giftTypeId: string,
  request: AdjustGiftStockRequest,
  actor: { volunteerId: string; audit: AuditContext },
): Promise<GiftTypeRecord> {
  return prisma.$transaction(async (tx) => {
    const giftType = await findGiftType(giftTypeId, tx);
    if (!giftType) throw new NotFoundError('Gift type');
    const before = await totalsForGiftType(tx, giftTypeId);

    await createAdjustment(tx, {
      giftTypeId,
      delta: request.delta,
      reason: request.reason,
      createdById: actor.volunteerId,
    });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'gift.adjust',
      entityType: 'GiftType',
      entityId: giftTypeId,
      before: { adjustment: before.adjustment },
      after: { delta: request.delta, reason: request.reason },
    });

    return toGiftTypeRecord(giftType, await totalsForGiftType(tx, giftTypeId));
  });
}
