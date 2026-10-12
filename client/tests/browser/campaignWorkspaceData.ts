import { EntityResponse, RecordsResponse, SearchResponse } from '@spoh/shared';
import type { CampaignContext, CampaignResponse } from './campaignTypes';

export function campaignWorkspaceResponses(input: CampaignContext): CampaignResponse[] {
  const destination = { kind: 'station', id: 'station' } as const;
  return [
    { path: '/workspace/entity', query: destination, body: EntityResponse.parse({ ref: destination, title: 'Room',
      fields: [{ label: 'Station code', value: 'ROOM', format: 'text' }],
      facets: [{ name: 'Current room entries', availability: 'available' }], related: [{ label: 'Room entries',
        destination: { type: 'records', filter: { kind: 'footfall', stationId: 'station', asOf: input.now, includeRehearsal: false } } }],
      actions: [], asOf: input.now }) },
    { path: '/workspace/records', query: { kind: 'footfall', stationId: 'station', limit: '50' }, body: RecordsResponse.parse({
      filter: { kind: 'footfall', stationId: 'station', asOf: input.now }, asOf: input.now,
      data: [{ id: 'campaign-tick', title: 'Room · Paper count', recordedAt: input.now,
        fields: [{ label: 'Room entries', value: 12, format: 'number' }], destination, related: [] }],
      aggregate: { value: 12, unit: 'roomEntries' }, meta: { count: 1, nextCursor: null } }) },
    { path: '/workspace/search', query: { query: 'Room', limit: '20' }, body: SearchResponse.parse({
      data: [{ title: 'Room', detail: 'Station · ROOM', destination }], meta: { count: 1, truncated: false } }) },
  ];
}
