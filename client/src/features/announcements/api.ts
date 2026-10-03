import {
  AnnouncementDraftRecord,
  AnnouncementPublicationScheduleRecord,
  collection,
  type AnnouncementRecord,
  type CreateAnnouncementRequest,
  type CreateAnnouncementDraftRequest,
  type UpdateAnnouncementDraftRequest,
  type ScheduleAnnouncementDraftRequest,
  type UpdateAnnouncementPublicationScheduleRequest,
  type CancelAnnouncementPublicationScheduleRequest,
} from '@spoh/shared';
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

const draftsPage = collection(AnnouncementDraftRecord);
const schedulesPage = collection(AnnouncementPublicationScheduleRecord);
const pageQuery = (cursor?: string) =>
  `?limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
const draftPath = (id: string) => `/announcements/drafts/${encodeURIComponent(id)}`;
const schedulePath = (id: string, scheduleId: string) =>
  `${draftPath(id)}/schedules/${encodeURIComponent(scheduleId)}`;

export async function listAnnouncementDrafts(eventId: string, cursor?: string) {
  return draftsPage.parse(await eventApi(eventId, `/announcements/drafts${pageQuery(cursor)}`));
}
export async function saveAnnouncementDraft(eventId: string, body: CreateAnnouncementDraftRequest) {
  const result = await eventApi<{ draft: unknown }>(eventId, '/announcements/drafts', {
    method: 'POST',
    body,
  });
  return AnnouncementDraftRecord.parse(result.draft);
}
export async function replaceAnnouncementDraft(
  eventId: string,
  id: string,
  body: UpdateAnnouncementDraftRequest,
) {
  const result = await eventApi<{ draft: unknown }>(eventId, draftPath(id), {
    method: 'PUT',
    body,
  });
  return AnnouncementDraftRecord.parse(result.draft);
}
export async function listAnnouncementSchedules(eventId: string, id: string, cursor?: string) {
  return schedulesPage.parse(
    await eventApi(eventId, `${draftPath(id)}/schedules${pageQuery(cursor)}`),
  );
}
export async function createAnnouncementSchedule(
  eventId: string,
  id: string,
  body: ScheduleAnnouncementDraftRequest,
) {
  const result = await eventApi<{ schedule: unknown }>(eventId, `${draftPath(id)}/schedules`, {
    method: 'POST',
    body,
  });
  return AnnouncementPublicationScheduleRecord.parse(result.schedule);
}
export async function changeAnnouncementSchedule(
  eventId: string,
  input: { id: string; scheduleId: string; request: UpdateAnnouncementPublicationScheduleRequest },
) {
  const result = await eventApi<{ schedule: unknown }>(
    eventId,
    schedulePath(input.id, input.scheduleId),
    {
      method: 'PUT',
      body: input.request,
    },
  );
  return AnnouncementPublicationScheduleRecord.parse(result.schedule);
}
export async function cancelAnnouncementSchedule(
  eventId: string,
  input: { id: string; scheduleId: string; request: CancelAnnouncementPublicationScheduleRequest },
) {
  const result = await eventApi<{ schedule: unknown }>(
    eventId,
    `${schedulePath(input.id, input.scheduleId)}/cancel`,
    { method: 'POST', body: input.request },
  );
  return AnnouncementPublicationScheduleRecord.parse(result.schedule);
}
