import { NoticeDetailResponse, NoticeListResponse, NoticePreferenceRecord,
  type PushConfigResponse, type PushSubscriptionRequest, type UpdateNoticePreferenceRequest } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export function getPushConfig(): Promise<PushConfigResponse> {
  return api<PushConfigResponse>('/notification-centre/device/config', { cache: 'no-store' });
}
export function registerPush(body: PushSubscriptionRequest): Promise<unknown> {
  return api('/notification-centre/device/subscriptions', { method: 'POST', body, cache: 'no-store' });
}
export function unregisterPush(endpoint: string): Promise<unknown> {
  return api('/notification-centre/device/subscriptions', { method: 'DELETE', body: { endpoint }, cache: 'no-store' });
}
export async function listNotices(input: { eventId?: string; unreadOnly: boolean; cursor?: string; signal?: AbortSignal }) {
  const params = new URLSearchParams({ limit: '25', unreadOnly: String(input.unreadOnly) });
  if (input.eventId) params.set('eventId', input.eventId);
  if (input.cursor) params.set('cursor', input.cursor);
  return NoticeListResponse.parse(await api(`/notification-centre?${params}`, {
    cache: 'no-store', ...(input.signal ? { signal: input.signal } : {}) }));
}
export async function noticeDetail(id: string, signal?: AbortSignal) {
  return NoticeDetailResponse.parse(await api(`/notification-centre/${encodeURIComponent(id)}`, {
    cache: 'no-store', ...(signal ? { signal } : {}) }));
}
export async function markNoticeRead(id: string) {
  return NoticeDetailResponse.parse(await api(`/notification-centre/${encodeURIComponent(id)}/read`, {
    method: 'PUT', body: {}, cache: 'no-store' }));
}
export async function getNoticePreference(signal?: AbortSignal) {
  const result = await api<{ data: unknown }>('/notification-centre/preferences', {
    cache: 'no-store', ...(signal ? { signal } : {}) });
  return NoticePreferenceRecord.parse(result.data);
}
export async function saveNoticePreference(body: UpdateNoticePreferenceRequest) {
  const result = await api<{ data: unknown }>('/notification-centre/preferences', {
    method: 'PUT', body, cache: 'no-store' });
  return NoticePreferenceRecord.parse(result.data);
}
