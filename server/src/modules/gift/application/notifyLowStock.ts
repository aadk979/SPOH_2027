import type { GiftTypeRecord } from '@spoh/shared';
import { activeNoticeAudience, queueNotices } from '../../notification/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Tell the Deputy Coordinator and the Chief that stock is running out.
 *
 * The deck makes this an IC duty (§5); what actually happens when it is left to
 * someone noticing is that the first anyone hears of it is a visitor being
 * turned away at the desk.
 */
export async function queueLowStockNotice(tx: PrismaTransactionClient, scope: EventScope, input: {
  gift: GiftTypeRecord; beforeRemaining: number; transitionId: string;
  transitionType: 'REDEMPTION' | 'ADJUSTMENT'; now: Date;
}): Promise<void> {
  const { gift } = input;
  if (gift.rehearsal || input.beforeRemaining <= gift.lowStockThreshold || !gift.lowStock) return;
  await queueNotices(tx, scope, { kind: 'GIFT_LOW_STOCK', priority: 'OPERATIONAL',
    source: { kind: 'GIFT', id: gift.id }, transitionKey: `gift:${gift.id}:low:${input.transitionId}`,
    context: { type: 'gift', rehearsal: false, transitionId: input.transitionId,
      transitionType: input.transitionType, threshold: gift.lowStockThreshold, remaining: gift.remaining },
    recipientPersonIds: await activeNoticeAudience(scope, { tx, minimumRole: 'DEPUTY_COORDINATOR' }),
    createdAt: input.now });
}
