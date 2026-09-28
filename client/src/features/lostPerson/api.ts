import type { RaiseLostPersonRequest } from '@spoh/shared';
import type { ActiveLostPersonResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';

export function getActiveAlerts(): Promise<ActiveLostPersonResponse> {
  return api<ActiveLostPersonResponse>('/lost-person/active');
}

export function acknowledgeAlert(alertId: string): Promise<unknown> {
  return api(`/lost-person/${alertId}/ack`, { method: 'POST' });
}

export function resolveAlert(input: {
  alertId: string;
  outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER';
}): Promise<unknown> {
  return api(`/lost-person/${input.alertId}/resolve`, {
    method: 'POST',
    body: { outcome: input.outcome },
  });
}

export function raiseLostPerson(body: RaiseLostPersonRequest): Promise<unknown> {
  return api('/lost-person', { method: 'POST', body });
}
