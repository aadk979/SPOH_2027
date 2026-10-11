import {
  CreateFootfallBulkRequest,
  VoidRegistrationRequest,
  VoidFootfallTickRequest,
  RecentRegistrationsResponse,
  RecentFootfallResponse,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export type VoidRecordInput = {
  kind: 'registration' | 'footfall';
  recordId: string;
  reason: string;
};

export function voidRecord(eventId: string, input: VoidRecordInput): Promise<unknown> {
  const id = encodeURIComponent(input.recordId);
  if (input.kind === 'registration') {
    return eventApi(eventId, `/registrations/${id}/void`, {
      method: 'POST',
      body: VoidRegistrationRequest.parse({ reason: input.reason }),
    });
  }
  return eventApi(eventId, `/footfall/ticks/${id}/void`, {
    method: 'POST',
    body: VoidFootfallTickRequest.parse({ reason: input.reason }),
  });
}

export function recordBulkFootfall(
  eventId: string,
  input: CreateFootfallBulkRequest,
): Promise<unknown> {
  return eventApi(eventId, '/footfall/bulk', {
    method: 'POST',
    body: CreateFootfallBulkRequest.parse(input),
  });
}

export async function recentCorrectionRecords(
  eventId: string,
  input: {
    kind: 'registration' | 'footfall';
    stationId: string;
    rehearsal: boolean;
    cursor?: string;
  },
) {
  const query = new URLSearchParams({
    stationId: input.stationId,
    rehearsal: String(input.rehearsal),
    limit: '50',
  });
  if (input.cursor) query.set('cursor', input.cursor);
  if (input.kind === 'registration')
    return RecentRegistrationsResponse.parse(
      await eventApi(eventId, `/registrations/recent?${query}`),
    );
  return RecentFootfallResponse.parse(await eventApi(eventId, `/footfall/recent?${query}`));
}
