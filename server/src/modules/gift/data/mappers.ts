import type { GiftTypeRecord } from '@spoh/shared';
import type { GiftType } from '../../../generated/prisma/client.js';
import type { GiftTotals } from './repo.js';

/** Stock is derived, never stored: initial stock plus adjustments less redemptions. */
export function toGiftTypeRecord(gift: GiftType, totals: GiftTotals): GiftTypeRecord {
  const initialStock = totals.rehearsal ? gift.rehearsalInitialStock : gift.initialStock;
  const remaining = initialStock + totals.adjustment - totals.redeemed;

  return {
    id: gift.id,
    name: gift.name,
    initialStock,
    rehearsal: totals.rehearsal ?? false,
    lowStockThreshold: gift.lowStockThreshold,
    active: gift.active,
    remaining,
    redeemed: totals.redeemed,
    adjustment: totals.adjustment,
    lowStock: remaining <= gift.lowStockThreshold,
    outOfStock: remaining <= 0,
  };
}
