import { eventApi } from '@/shared/lib/eventApi';
export function checkIn(eventId: string, assignmentId: string | undefined): Promise<unknown> {
  return eventApi(eventId, '/me/check-in', { method: 'POST', body: { assignmentId } });
}
export function checkOut(eventId: string, assignmentId: string): Promise<unknown> {
  return eventApi(eventId, '/me/check-out', { method: 'POST', body: { assignmentId } });
}
