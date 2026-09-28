import type { PushConfigResponse, PushSubscriptionRequest } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export function getPushConfig(): Promise<PushConfigResponse> {
  return api<PushConfigResponse>('/notifications/config');
}
export function registerPush(body: PushSubscriptionRequest): Promise<unknown> {
  return api('/notifications/subscriptions', { method: 'POST', body });
}
export function unregisterPush(endpoint: string): Promise<unknown> {
  return api('/notifications/subscriptions', { method: 'DELETE', body: { endpoint } });
}
