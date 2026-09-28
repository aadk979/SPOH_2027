import { api } from '@/shared/lib/api';
export function checkIn(assignmentId: string | undefined): Promise<unknown> {
  return api('/me/check-in', { method: 'POST', body: { assignmentId } });
}
export function checkOut(assignmentId: string): Promise<unknown> {
  return api('/me/check-out', { method: 'POST', body: { assignmentId } });
}
