import type { RegistrationSummaryQuery, RegistrationSummaryResponse } from '@spoh/shared';
import { rangeOverlapsFallbackWindow } from '../../fallback/index.js';
import {
  countMatching,
  groupByCategory,
  groupByTimeBucket,
  type RegistrationSummaryFilter,
} from '../data/repo.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { eventZone } from '../../../platform/event/currentEvent.js';
import { zonedDayWindow } from '@spoh/shared';

async function bucketsFor(
  scope: EventScope,
  groupBy: RegistrationSummaryQuery['groupBy'],
  filter: RegistrationSummaryFilter,
): Promise<RegistrationSummaryResponse['buckets']> {
  if (groupBy === 'category') {
    return (await groupByCategory(scope, filter)).map((row) => ({
      key: row.category,
      label: row.label,
      value: row.count,
    }));
  }
  // A day bucket is keyed by the instant the event day starts (its local
  // date read at the day boundary), an hour bucket by the instant it starts.
  const zone = await eventZone(scope);
  const rows = await groupByTimeBucket(scope, filter, { granularity: groupBy, zone });
  const startOf = (bucket: Date): Date =>
    groupBy === 'day'
      ? zonedDayWindow(bucket.toISOString().slice(0, 10), zone.timezone, zone.dayBoundaryMinutes)
          .start
      : bucket;
  return rows.map((row) => ({ key: startOf(row.bucket).toISOString(), value: row.count }));
}

export async function summariseRegistrations(
  scope: EventScope,
  query: RegistrationSummaryQuery,
): Promise<RegistrationSummaryResponse> {
  const filter = {
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
  };

  const [total, containsFallbackData] = await Promise.all([
    countMatching(scope, filter),
    rangeOverlapsFallbackWindow(scope, filter),
  ]);

  return {
    // The unit is stated explicitly on every count so nobody can add this to a
    // footfall figure by accident (PRODUCT_BRIEF §0.1).
    unit: 'registrations',
    groupBy: query.groupBy,
    total,
    buckets: await bucketsFor(scope, query.groupBy, filter),
    containsFallbackData,
  };
}
