import {
  EventLifecycleResponse,
  LifecycleReadinessResponse,
  TransitionEventRequest,
  type MyEventsResponse,
  EventAdministrationResponse,
  EventCreatedResponse,
  CreateEventRequest,
  CloneEventWizardRequest,
} from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { eventApi } from '@/shared/lib/eventApi';

/** The caller's events: a platform route, outside any one event (ADR-001 §4). */
export function listMyEvents(): Promise<MyEventsResponse> {
  return api<MyEventsResponse>('/events');
}

export async function getEventAdministration(): Promise<EventAdministrationResponse> {
  return EventAdministrationResponse.parse(await api('/events/administration'));
}

export async function createEvent(input: CreateEventRequest): Promise<EventCreatedResponse> {
  return EventCreatedResponse.parse(
    await api('/events', { method: 'POST', body: CreateEventRequest.parse(input) }),
  );
}

export async function cloneEvent(input: CloneEventWizardRequest): Promise<EventCreatedResponse> {
  return EventCreatedResponse.parse(
    await api('/events/clone', { method: 'POST', body: CloneEventWizardRequest.parse(input) }),
  );
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
