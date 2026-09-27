import type { CardFunnelResponse } from '@spoh/shared';
import { rangeOverlapsFallbackWindow } from '../../fallback/index.js';
import { listStampingStations } from '../../station/index.js';
import {
  countByStatus,
  countCardsPerStation,
  countIssued,
  countRedeemedCards,
  countVoided,
} from '../data/repo.js';
import { buildFunnelStages } from '../domain/funnel.js';

/** The card funnel for a time range. Every stage is a count of cards. */
export async function getFunnel(range: {
  from?: string;
  to?: string;
}): Promise<CardFunnelResponse> {
  const filter = {
    ...(range.from ? { from: new Date(range.from) } : {}),
    ...(range.to ? { to: new Date(range.to) } : {}),
  };

  const [issued, completed, redeemed, voided, perStation, stations, containsFallbackData] =
    await Promise.all([
      countIssued(filter),
      countByStatus('COMPLETED', filter),
      countRedeemedCards(filter),
      countVoided(filter),
      countCardsPerStation(filter),
      listStampingStations(),
      rangeOverlapsFallbackWindow(filter),
    ]);

  return {
    unit: 'cards',
    issued,
    completed,
    redeemed,
    voided,
    stages: buildFunnelStages({ issued, completed, redeemed, stations, perStation }),
    containsFallbackData,
  };
}
