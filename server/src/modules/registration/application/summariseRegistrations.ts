import type { RegistrationSummaryQuery, RegistrationSummaryResponse } from '@spoh/shared';
import { rangeOverlapsFallbackWindow } from '../../fallback/index.js';
import {
  countMatching,
  groupByCategory,
  groupByTimeBucket,
  type RegistrationSummaryFilter,
} from '../data/repo.js';

async function bucketsFor(
  groupBy: RegistrationSummaryQuery['groupBy'],
  filter: RegistrationSummaryFilter,
): Promise<RegistrationSummaryResponse['buckets']> {
  if (groupBy === 'category') {
    return (await groupByCategory(filter)).map((row) => ({ key: row.category, value: row.count }));
  }
  return (await groupByTimeBucket(filter, groupBy)).map((row) => ({
    key: row.bucket.toISOString(),
    value: row.count,
  }));
}

export async function summariseRegistrations(
  query: RegistrationSummaryQuery,
): Promise<RegistrationSummaryResponse> {
  const filter = {
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
  };

  const [total, containsFallbackData] = await Promise.all([
    countMatching(filter),
    rangeOverlapsFallbackWindow(filter),
  ]);

  return {
    // The unit is stated explicitly on every count so nobody can add this to a
    // footfall figure by accident (PRODUCT_BRIEF §0.1).
    unit: 'registrations',
    groupBy: query.groupBy,
    total,
    buckets: await bucketsFor(query.groupBy, filter),
    containsFallbackData,
  };
}
