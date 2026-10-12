import type {
  CreateRegistrationRequest,
  CreateRegistrationResponse,
  CreateVisitorFieldRequest,
  UpdateVisitorFieldRequest,
  VisitorFieldRecord,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import { VisitorFieldRecord as VisitorFieldSchema, VisitorRecordsResponse } from '@spoh/shared';
export async function readVisitorRecords(eventId: string, signal?: AbortSignal) {
  return VisitorRecordsResponse.parse(await eventApi(eventId, '/visitors', { cache: 'no-store', signal }));
}

export async function listVisitorFields(eventId: string, signal?: AbortSignal): Promise<VisitorFieldRecord[]> {
  const response = await eventApi<{ data: unknown }>(eventId, '/admin/visitor-fields', { cache: 'no-store', signal });
  return VisitorFieldSchema.array().parse(response.data);
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
