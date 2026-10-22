import type { GiftSummaryQuery, GiftSummaryResponse } from '@spoh/shared';
import { rangeOverlapsFallbackWindow } from '../../fallback/index.js';
import { summariseRedemptions } from '../data/repo.js';
import { listGifts } from './listGifts.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { systemClock } from '../../../platform/time/index.js';
import { reportingRange } from '../../../platform/event/reportingRange.js';

export async function summariseGifts(
  scope: EventScope,
  query: GiftSummaryQuery,
): Promise<GiftSummaryResponse> {
  const asOf = systemClock.now();
  const filter = {
    asOf,
    rehearsal: (await captureProvenance(prisma, scope)).rehearsal,
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(await reportingRange(scope, query)),
  };

  const [rows, gifts, containsFallbackData] = await Promise.all([
    summariseRedemptions(scope, filter),
    listGifts({ ...scope, rehearsal: filter.rehearsal, asOf }),
    rangeOverlapsFallbackWindow(scope, filter),
  ]);
  const counts = new Map(rows.map((row) => [row.giftTypeId, row.count]));

  return {
    unit: 'redemptions',
    rehearsal: filter.rehearsal,
    asOf: asOf.toISOString(),
    total: rows.reduce((sum, row) => sum + row.count, 0),
    byGiftType: gifts.map((gift) => ({
      giftTypeId: gift.id,
      giftTypeName: gift.name,
      redeemed: counts.get(gift.id) ?? 0,
      remaining: gift.remaining,
    })),
    containsFallbackData,
  };
}
