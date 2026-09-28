import type { AnnouncementRecord, CreateAnnouncementRequest } from '@spoh/shared';
import { api } from '@/shared/lib/api';
export async function listAnnouncements(): Promise<AnnouncementRecord[]> {
  return (await api<{ data: AnnouncementRecord[] }>('/announcements')).data;
}
export function acknowledgeAnnouncement(id: string): Promise<unknown> {
  return api(`/announcements/${id}/ack`, { method: 'POST' });
}
export function sendAnnouncement(body: CreateAnnouncementRequest): Promise<unknown> {
  return api('/announcements', { method: 'POST', body });
}
