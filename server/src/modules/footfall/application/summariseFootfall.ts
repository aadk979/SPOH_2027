import type { FootfallSummaryQuery, FootfallSummaryResponse } from '@spoh/shared';
import { BUCKET_MINUTES } from '../../../platform/time/index.js';
import { rangeOverlapsFallbackWindow } from '../../fallback/index.js';
import { listCountedStations } from '../../station/index.js';
import { sumByBucket, sumMatching, type FootfallFilter } from '../data/repo.js';
import { bucketsByStation } from '../domain/footfallRules.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { eventTimezone } from '../../../platform/event/currentEvent.js';

export async function summariseFootfall(
  scope: EventScope,
  query: FootfallSummaryQuery,
): Promise<FootfallSummaryResponse> {
  const filter: FootfallFilter = {
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
  };

  const bucket = { minutes: BUCKET_MINUTES[query.bucket], timezone: await eventTimezone(scope) };
  const [total, containsFallbackData, stations, rows] = await Promise.all([
    sumMatching(scope, filter),
    rangeOverlapsFallbackWindow(scope, filter),
    listCountedStations(scope),
    sumByBucket(scope, filter, bucket),
  ]);

  const byStation = bucketsByStation(rows);
  const included = query.stationId
    ? stations.filter((station) => station.id === query.stationId)
    : stations;

  return {
    unit: 'roomEntries',
    bucket: query.bucket,
    total,
    stations: included.map((station) => {
      const buckets = byStation.get(station.id) ?? [];
      return {
        stationId: station.id,
        stationName: station.name,
        total: buckets.reduce((sum, bucket) => sum + bucket.value, 0),
        buckets,
      };
    }),
    containsFallbackData,
  };
}
