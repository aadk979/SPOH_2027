import {
  ScheduleTimelineResponse,
  type ScheduledActionStatus,
  CaptureScheduleListQuery,
  CaptureScheduleListResponse,
  CaptureScheduleResponse,
  CreateCaptureScheduleRequest,
  UpdateCaptureScheduleRequest,
  CancelCaptureScheduleRequest,
  type ScopedSettingsTarget,
  type ScopedOperationalSettingKey,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import { assertCaptureTarget } from './model/captureScheduleResponse';

export async function listScheduleTimeline(
  eventId: string,
  input: { status?: ScheduledActionStatus; cursor?: string },
) {
  const query = new URLSearchParams({ limit: '20' });
  if (input.status) query.set('status', input.status);
  if (input.cursor) query.set('cursor', input.cursor);
  const page = ScheduleTimelineResponse.parse(await eventApi(eventId, `/schedules?${query}`));
  if (page.eventId !== eventId) throw new Error('Schedule timeline event mismatch');
  return page;
}

export async function listCaptureSchedules(
  eventId: string,
  input: {
    target: ScopedSettingsTarget;
    key?: ScopedOperationalSettingKey;
    status?: ScheduledActionStatus;
    cursor?: string;
  },
) {
  const query = CaptureScheduleListQuery.parse({
    ...input.target,
    key: input.key,
    status: input.status,
    cursor: input.cursor,
    limit: 20,
  });
  const params = new URLSearchParams({
    scope: query.scope,
    key: query.key,
    limit: String(query.limit),
  });
  if (query.stationId) params.set('stationId', query.stationId);
  if (query.status) params.set('status', query.status);
  if (query.cursor) params.set('cursor', query.cursor);
  const page = CaptureScheduleListResponse.parse(
    await eventApi(eventId, `/admin/settings/catalogue/schedules?${params}`, { cache: 'no-store' }),
  );
  assertCaptureTarget(eventId, input.target, page);
  if (page.key !== query.key) throw new Error('Setting schedule key mismatch');
  return page;
}
function captureResponse(
  eventId: string,
  input: { target: ScopedSettingsTarget; id?: string },
  result: unknown,
) {
  const response = CaptureScheduleResponse.parse(result);
  assertCaptureTarget(eventId, input.target, response.current);
  if (input.id && response.schedule.id !== input.id)
    throw new Error('Capture schedule action mismatch');
  // A receipt replay returns the latest definition, even after another successful edit.
  return response;
}
export async function createCaptureSchedule(eventId: string, input: CreateCaptureScheduleRequest) {
  const body = CreateCaptureScheduleRequest.parse(input);
  return captureResponse(
    eventId,
    { target: body.target },
    await eventApi(eventId, '/admin/settings/catalogue/schedules', {
      method: 'POST',
      body,
      cache: 'no-store',
    }),
  );
}
export async function getCaptureSchedule(
  eventId: string,
  input: { id: string; target: ScopedSettingsTarget },
) {
  return captureResponse(
    eventId,
    input,
    await eventApi(eventId, `/admin/settings/catalogue/schedules/${encodeURIComponent(input.id)}`, {
      cache: 'no-store',
    }),
  );
}
export async function updateCaptureSchedule(
  eventId: string,
  input: { id: string; target: ScopedSettingsTarget; body: UpdateCaptureScheduleRequest },
) {
  const body = UpdateCaptureScheduleRequest.parse(input.body);
  return captureResponse(
    eventId,
    input,
    await eventApi(eventId, `/admin/settings/catalogue/schedules/${encodeURIComponent(input.id)}`, {
      method: 'PATCH',
      body,
      cache: 'no-store',
    }),
  );
}
export async function cancelCaptureSchedule(
  eventId: string,
  input: { id: string; target: ScopedSettingsTarget; body: CancelCaptureScheduleRequest },
) {
  const body = CancelCaptureScheduleRequest.parse(input.body);
  return captureResponse(
    eventId,
    input,
    await eventApi(
      eventId,
      `/admin/settings/catalogue/schedules/${encodeURIComponent(input.id)}/cancel`,
      { method: 'POST', body, cache: 'no-store' },
    ),
  );
}
