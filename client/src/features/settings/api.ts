import type {
  AttendanceConfig,
  ChangeAttendanceConfigRequest,
  ChangeEventSettingRequest,
  EventSettingsResponse,
  RuntimeSettings,
  SettingsResponse,
  ShiftTemplateRecord,
  TestAttendanceNetworkRequest,
  TestAttendanceNetworkResponse,
  UpdateShiftTemplateRequest,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import {
  EventSettingHistoryQuery,
  EventSettingHistoryResponse,
  EventSettingsResponse as EventSettingsSchema,
  RevertEventSettingRequest,
  RevertEventSettingResponse,
  type EventSettingKey,
} from '@spoh/shared';
export function getSettings(eventId: string): Promise<SettingsResponse> {
  return eventApi<SettingsResponse>(eventId, '/admin/settings');
}
export function saveSettings(
  eventId: string,
  body: Partial<RuntimeSettings>,
): Promise<SettingsResponse> {
  return eventApi<SettingsResponse>(eventId, '/admin/settings', { method: 'PATCH', body });
}

/** The event's shift templates: the hours capture and check-in obey (ADR-002). */
export async function listShiftTemplates(eventId: string): Promise<ShiftTemplateRecord[]> {
  return (await eventApi<{ data: ShiftTemplateRecord[] }>(eventId, '/admin/shift-templates')).data;
}

export async function saveShiftTemplate(
  eventId: string,
  change: { id: string; body: UpdateShiftTemplateRequest },
): Promise<ShiftTemplateRecord> {
  const path = `/admin/shift-templates/${change.id}`;
  return (
    await eventApi<{ template: ShiftTemplateRecord }>(eventId, path, {
      method: 'PATCH',
      body: change.body,
    })
  ).template;
}

/** The event's product rules, with the version of each (ADR-003). */
export function getEventSettings(eventId: string): Promise<EventSettingsResponse> {
  return eventApi<EventSettingsResponse>(eventId, '/admin/event-settings');
}

export function changeEventSetting(
  eventId: string,
  body: ChangeEventSettingRequest,
): Promise<EventSettingsResponse> {
  return eventApi<EventSettingsResponse>(eventId, '/admin/event-settings', {
    method: 'PATCH',
    body,
  });
}

/** History and its review refuse a response belonging to another event or key. */
export async function getEventSettingHistory(
  eventId: string,
  input: { key: EventSettingKey; cursor?: string },
) {
  const query = EventSettingHistoryQuery.parse({ ...input, limit: 20 });
  const params = new URLSearchParams({ key: query.key, limit: String(query.limit) });
  if (query.cursor) params.set('cursor', query.cursor);
  const result = EventSettingHistoryResponse.parse(
    await eventApi<unknown>(eventId, `/admin/event-settings/history?${params}`, {
      cache: 'no-store',
    }),
  );
  if (result.eventId !== eventId || result.key !== query.key)
    throw new Error('Setting history does not match this event and key');
  return result;
}

export async function getReviewedEventSettings(eventId: string) {
  return EventSettingsSchema.parse(
    await eventApi<unknown>(eventId, '/admin/event-settings', { cache: 'no-store' }),
  );
}

export async function revertEventSetting(eventId: string, input: RevertEventSettingRequest) {
  const body = RevertEventSettingRequest.parse(input);
  const result = RevertEventSettingResponse.parse(
    await eventApi<unknown>(eventId, '/admin/event-settings/revert', { method: 'POST', body }),
  );
  if (
    result.history.eventId !== eventId ||
    result.history.key !== body.key ||
    result.revertedFrom.historyId !== body.historyId ||
    result.reviewedVersion !== body.expectedVersion
  )
    throw new Error('Setting revert does not match this review');
  return result;
}

/** Event attendance root and trusted networks, with independent versions. */
export function getAttendanceConfig(eventId: string): Promise<AttendanceConfig> {
  return eventApi<AttendanceConfig>(eventId, '/admin/attendance-settings');
}

export function changeAttendanceConfig(
  eventId: string,
  body: ChangeAttendanceConfigRequest,
): Promise<AttendanceConfig> {
  return eventApi<AttendanceConfig>(eventId, '/admin/attendance-settings', {
    method: 'PATCH',
    body,
  });
}

export function testAttendanceNetwork(
  eventId: string,
  body: TestAttendanceNetworkRequest,
): Promise<TestAttendanceNetworkResponse> {
  return eventApi<TestAttendanceNetworkResponse>(
    eventId,
    '/admin/attendance-settings/test-network',
    {
      method: 'POST',
      body,
    },
  );
}
