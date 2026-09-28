import type { RuntimeSettings, SettingsResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export function getSettings(): Promise<SettingsResponse> {
  return api<SettingsResponse>('/admin/settings');
}
export function saveSettings(body: Partial<RuntimeSettings>): Promise<SettingsResponse> {
  return api<SettingsResponse>('/admin/settings', { method: 'PATCH', body });
}
