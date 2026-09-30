import type { MyEventsResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';

/** The caller's events: a platform route, outside any one event (ADR-001 §4). */
export function listMyEvents(): Promise<MyEventsResponse> {
  return api<MyEventsResponse>('/events');
}
