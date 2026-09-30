import type { RaiseLostPersonRequest } from '@spoh/shared';
import type { ActiveLostPersonResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export function getActiveAlerts(eventId: string): Promise<ActiveLostPersonResponse> {
  return eventApi<ActiveLostPersonResponse>(eventId, '/lost-person/active');
}

export function acknowledgeAlert(eventId: string, alertId: string): Promise<unknown> {
  return eventApi(eventId, `/lost-person/${alertId}/ack`, { method: 'POST' });
}

export function resolveAlert(
  eventId: string,
  input: {
    alertId: string;
    outcome: 'RESOLVED_FOUND' | 'RESOLVED_OTHER';
  },
): Promise<unknown> {
  return eventApi(eventId, `/lost-person/${input.alertId}/resolve`, {
    method: 'POST',
    body: { outcome: input.outcome },
  });
}

export function raiseLostPerson(eventId: string, body: RaiseLostPersonRequest): Promise<unknown> {
  return eventApi(eventId, '/lost-person', { method: 'POST', body });
}
