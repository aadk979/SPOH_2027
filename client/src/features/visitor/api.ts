import type {
  CreateRegistrationRequest,
  CreateRegistrationResponse,
  CreateVisitorFieldRequest,
  UpdateVisitorFieldRequest,
  VisitorFieldRecord,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export async function listVisitorFields(eventId: string): Promise<VisitorFieldRecord[]> {
  return (await eventApi<{ data: VisitorFieldRecord[] }>(eventId, '/admin/visitor-fields')).data;
}

export async function createVisitorField(eventId: string, body: CreateVisitorFieldRequest) {
  return (
    await eventApi<{ field: VisitorFieldRecord }>(eventId, '/admin/visitor-fields', {
      method: 'POST',
      body,
    })
  ).field;
}

export async function updateVisitorField(
  eventId: string,
  id: string,
  body: UpdateVisitorFieldRequest,
) {
  return (
    await eventApi<{ field: VisitorFieldRecord }>(
      eventId,
      `/admin/visitor-fields/${encodeURIComponent(id)}`,
      { method: 'PATCH', body },
    )
  ).field;
}

/** Personal details are sent directly; the offline count outbox never stores them. */
export function captureVisitorRegistration(eventId: string, body: CreateRegistrationRequest) {
  return eventApi<CreateRegistrationResponse>(eventId, '/registrations', {
    method: 'POST',
    body,
  });
}
