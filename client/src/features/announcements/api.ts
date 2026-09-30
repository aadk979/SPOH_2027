import type { AnnouncementRecord, CreateAnnouncementRequest } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export async function listAnnouncements(eventId: string): Promise<AnnouncementRecord[]> {
  return (await eventApi<{ data: AnnouncementRecord[] }>(eventId, '/announcements')).data;
}
export function acknowledgeAnnouncement(eventId: string, id: string): Promise<unknown> {
  return eventApi(eventId, `/announcements/${id}/ack`, { method: 'POST' });
}
export function sendAnnouncement(
  eventId: string,
  body: CreateAnnouncementRequest,
): Promise<unknown> {
  return eventApi(eventId, '/announcements', { method: 'POST', body });
}
