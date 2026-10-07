import type {
  ChangeOrganisationSettingRequest,
  OrganisationSettingsResponse,
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
  ScopedSettingsReadQuery,
  ScopedSettingsReadResponse,
  ScopedSettingsHistoryQuery,
  ScopedSettingsHistoryResponse,
  ScopedSettingsMutationRequest,
  ScopedSettingsMutationResponse,
  ScopedSettingsRevertRequest,
  ScopedSettingsRevertResponse,
  type ScopedSettingsTarget,
  type ScopedOperationalSettingKey,
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

function assertScopedTarget(
  eventId: string,
  target: ScopedSettingsTarget,
  response: { eventId: string; target: ScopedSettingsTarget },
) {
  if (
    response.eventId !== eventId ||
    response.target.scope !== target.scope ||
    (target.scope === 'station' &&
      (response.target.scope !== 'station' || response.target.stationId !== target.stationId))
  )
    throw new Error('Setting response does not match this event and scope');
}
export async function getScopedSettings(eventId: string, input: ScopedSettingsTarget) {
  const query = ScopedSettingsReadQuery.parse(input);
  const params = new URLSearchParams({ scope: query.scope });
  if (query.stationId) params.set('stationId', query.stationId);
  const response = ScopedSettingsReadResponse.parse(
    await eventApi<unknown>(eventId, `/admin/settings/catalogue?${params}`, { cache: 'no-store' }),
  );
  assertScopedTarget(eventId, input, response);
  return response;
}
export async function getScopedSettingHistory(
  eventId: string,
  input: {
    target: ScopedSettingsTarget;
    key: ScopedOperationalSettingKey;
    cursor?: string;
  },
) {
  const query = ScopedSettingsHistoryQuery.parse({
    ...input.target,
    key: input.key,
    cursor: input.cursor,
    limit: 20,
  });
  const params = new URLSearchParams({
    scope: query.scope,
    key: query.key,
    limit: String(query.limit),
  });
  if (query.stationId) params.set('stationId', query.stationId);
  if (query.cursor) params.set('cursor', query.cursor);
  const response = ScopedSettingsHistoryResponse.parse(
    await eventApi<unknown>(eventId, `/admin/settings/catalogue/history?${params}`, {
      cache: 'no-store',
    }),
  );
  assertScopedTarget(eventId, input.target, response);
  if (response.key !== input.key) throw new Error('Setting history does not match this key');
  return response;
}
export async function changeScopedSetting(eventId: string, input: ScopedSettingsMutationRequest) {
  const body = ScopedSettingsMutationRequest.parse(input);
  const response = ScopedSettingsMutationResponse.parse(
    await eventApi<unknown>(eventId, '/admin/settings/catalogue', {
      method: 'POST',
      body,
      cache: 'no-store',
    }),
  );
  assertScopedTarget(eventId, body.target, response.current);
  if (
    response.change.key !== body.key ||
    response.change.operation !== body.operation ||
    response.reviewedVersion !== body.expectedVersion
  )
    throw new Error('Setting change does not match this review');
  return response;
}
export async function revertScopedSetting(eventId: string, input: ScopedSettingsRevertRequest) {
  const body = ScopedSettingsRevertRequest.parse(input);
  const response = ScopedSettingsRevertResponse.parse(
    await eventApi<unknown>(eventId, '/admin/settings/catalogue/revert', {
      method: 'POST',
      body,
      cache: 'no-store',
    }),
  );
  assertScopedTarget(eventId, body.target, response.current);
  if (
    response.history.key !== body.key ||
    response.revertedFrom.historyId !== body.historyId ||
    response.reviewedVersion !== body.expectedVersion
  )
    throw new Error('Setting restore does not match this review');
  return response;
}

/** The event's organisation-wide settings, and whether the caller may change them (D-17). */
export function getOrganisationSettings(eventId: string): Promise<OrganisationSettingsResponse> {
  return eventApi<OrganisationSettingsResponse>(eventId, '/admin/organisation-settings');
}

export function changeOrganisationSetting(
  eventId: string,
  body: ChangeOrganisationSettingRequest,
): Promise<OrganisationSettingsResponse> {
  return eventApi<OrganisationSettingsResponse>(eventId, '/admin/organisation-settings', {
    method: 'PATCH',
    body,
  });
}
