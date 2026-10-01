import type {
  ChangeEventSettingRequest,
  EventSettingsResponse,
  RuntimeSettings,
  SettingsResponse,
  ShiftTemplateRecord,
  UpdateShiftTemplateRequest,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
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
