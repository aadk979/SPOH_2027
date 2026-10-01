import type { CardFunnelQuery, CardFunnelResponse } from '@spoh/shared';
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
import type { ReportingScope } from '../../../platform/db/rehearsalFilter.js';

/** The card funnel for a time range. Every stage is a count of cards. */
export async function getFunnel(
  eventScope: ReportingScope,
  range: CardFunnelQuery,
): Promise<CardFunnelResponse> {
  const scope = {
    ...eventScope,
    includeRehearsal: range.includeRehearsal ?? eventScope.includeRehearsal ?? false,
  };
  const filter = {
    ...(range.from ? { from: new Date(range.from) } : {}),
    ...(range.to ? { to: new Date(range.to) } : {}),
  };

  const [issued, completed, redeemed, voided, perStation, stations, containsFallbackData] =
    await Promise.all([
      countIssued(scope, filter),
      countByStatus(scope, 'COMPLETED', filter),
      countRedeemedCards(scope, filter),
      countVoided(scope, filter),
      countCardsPerStation(scope, filter),
      listStampingStations(scope),
      rangeOverlapsFallbackWindow(scope, filter),
    ]);

  return {
    rehearsalIncluded: scope.includeRehearsal,
    unit: 'cards',
    issued,
    completed,
    redeemed,
    voided,
    stages: buildFunnelStages({ issued, completed, redeemed, stations, perStation }),
    containsFallbackData,
  };
}
