import { CaptureCategoriesResponse, FootfallTickRecord, MissionCardRecord, RecentFootfallResponse,
  RecentRegistrationsResponse, RegistrationRecord, VisitorFieldRecord, VisitorRecordsResponse } from '@spoh/shared';
import { z } from 'zod';
import type { CampaignContext, CampaignResponse } from './campaignTypes';

export function campaignCaptureResponses(input: CampaignContext): CampaignResponse[] {
  const card = MissionCardRecord.parse({ id: 'campaign-card', shortCode: 'A23456', rehearsal: false, status: 'ISSUED',
    issuedAt: input.now, completedAt: null, voidedAt: null, reissuedFromId: null, batchLabel: 'Synthetic live batch',
    stamps: [], remainingStationIds: ['station'], redeemed: false });
  const registration = RegistrationRecord.parse({ id: 'campaign-registration', category: 'GUEST', categoryLabel: 'Guests',
    stationId: 'station', groupId: null, missionCardId: card.id, source: 'APP', recordedAt: input.now,
    clientRecordedAt: input.now, voided: false });
  const tick = FootfallTickRecord.parse({ id: 'campaign-tick', stationId: 'station', quantity: 12, source: 'PAPER',
    recordedAt: input.now, clientRecordedAt: null, timeBlockStart: '2027-01-08T01:30:00.000Z', voided: false });
  const fields = VisitorFieldRecord.array().parse([{ id: 'campaign-visitor-field', code: 'access_note', label: 'Access arrangement',
    type: 'text', classification: 'operational', retentionDays: 7, readers: ['ADMIN'], sortOrder: 0, active: true }]);
  const query = { stationId: 'station', rehearsal: 'false', limit: '50' };
  return [
    { path: '/media/config', body: z.object({ enabled: z.boolean() }).strict().parse({ enabled: true }) },
    { path: '/registrations/categories', body: CaptureCategoriesResponse.parse({ data: [{ code: 'GUEST', label: 'Guests' }] }) },
    { path: '/cards/A23456', body: { card } },
    { path: '/registrations/recent', query, body: RecentRegistrationsResponse.parse({ data: [registration], meta: { count: 1, nextCursor: null } }) },
    { path: '/footfall/recent', query, body: RecentFootfallResponse.parse({ data: [tick], meta: { count: 1, nextCursor: null } }) },
    { path: '/admin/visitor-fields', body: { data: fields } },
    { path: '/visitors', body: VisitorRecordsResponse.parse({ fields, data: [{ registrationId: registration.id,
      rehearsal: false, recordedAt: input.now, values: { access_note: 'Synthetic step-free route request' } }] }) },
  ];
}
