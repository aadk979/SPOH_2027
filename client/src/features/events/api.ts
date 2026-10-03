import {
  EventLifecycleResponse,
  LifecycleReadinessResponse,
  TransitionEventRequest,
  type MyEventsResponse,
} from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { eventApi } from '@/shared/lib/eventApi';

/** The caller's events: a platform route, outside any one event (ADR-001 §4). */
export function listMyEvents(): Promise<MyEventsResponse> {
  return api<MyEventsResponse>('/events');
}

export async function getLifecycleReadiness(eventId: string): Promise<LifecycleReadinessResponse> {
  const response = LifecycleReadinessResponse.parse(
    await eventApi(eventId, '/lifecycle/readiness'),
  );
  if (response.lifecycle.eventId !== eventId) throw new Error('Unexpected lifecycle event');
  return response;
}

export async function transitionLifecycle(
  eventId: string,
  input: TransitionEventRequest,
): Promise<EventLifecycleResponse> {
  const response = EventLifecycleResponse.parse(
    await eventApi(eventId, '/lifecycle', {
      method: 'POST',
      body: TransitionEventRequest.parse(input),
    }),
  );
  if (response.lifecycle.eventId !== eventId) throw new Error('Unexpected lifecycle event');
  return response;
}
