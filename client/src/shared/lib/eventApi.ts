import { api, type ApiRequest } from './api';

/** An event's API path: `/events/<id>/registrations` (ADR-001 §4). */
export function eventApiPath(eventId: string, path: string): string {
  return `/events/${encodeURIComponent(eventId)}${path}`;
}

/** `api()` for a route of one event, named by id (never by slug). */
export function eventApi<T>(eventId: string, path: string, options?: ApiRequest): Promise<T> {
  const url = eventApiPath(eventId, path);
  return options ? api<T>(url, options) : api<T>(url);
}
