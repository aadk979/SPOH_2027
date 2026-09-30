import type { RuntimeSettings, SettingsResponse } from '@spoh/shared';
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
