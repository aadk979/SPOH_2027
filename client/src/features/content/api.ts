import {
  ContentDraftRecord,
  PublishedContentRecord,
  ContentImageResponse,
  ContentScheduleResponse,
  SaveContentDraftRequest,
  ReviewContentRequest,
  ScheduleContentRequest,
  type CreateContentImageRequest,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import { apiBlob } from '@/shared/lib/api';
import { NetworkError } from '@/shared/lib/apiErrors';
import { contentPointer, rememberContentVersion } from './model/contentPointer';

export async function getContentDraft(eventId: string) {
  const response = await eventApi<{ data: unknown }>(eventId, '/content/draft');
  const draft = ContentDraftRecord.parse(response.data);
  if (draft.eventId !== eventId) throw new Error('The guide belongs to another event');
  return draft;
}
export async function saveContentDraft(eventId: string, input: SaveContentDraftRequest) {
  const response = await eventApi<{ data: unknown }>(eventId, '/content/draft', {
    method: 'PUT',
    body: SaveContentDraftRequest.parse(input),
  });
  return ContentDraftRecord.parse(response.data);
}
export async function reviewContent(eventId: string, input: ReviewContentRequest) {
  const response = await eventApi<{ data: unknown }>(eventId, '/content/review', {
    method: 'POST',
    body: ReviewContentRequest.parse(input),
  });
  return ContentDraftRecord.parse(response.data);
}
export async function publishContent(eventId: string, input: ReviewContentRequest) {
  const response = await eventApi<{ data: unknown }>(eventId, '/content/publish', {
    method: 'POST',
    body: ReviewContentRequest.parse(input),
  });
  return PublishedContentRecord.parse(response.data);
}
export async function scheduleContent(eventId: string, input: ScheduleContentRequest) {
  const response = await eventApi<{ data: unknown }>(eventId, '/content/schedules', {
    method: 'POST',
    body: ScheduleContentRequest.parse(input),
  });
  return ContentScheduleResponse.parse(response.data);
}
export async function listContentVersions(eventId: string) {
  const response = await eventApi<{ data: unknown[] }>(eventId, '/content/versions');
  return response.data.map((item) => PublishedContentRecord.parse(item));
}
async function versionedContent(eventId: string, version?: string) {
  const suffix = version ? `?v=${encodeURIComponent(version)}` : '';
  const response = await eventApi<{ data: unknown }>(eventId, `/content${suffix}`, {
    cache: 'no-store',
    ...(version ? { offlineContent: true as const } : {}),
  });
  const record = PublishedContentRecord.parse(response.data);
  if (record.eventId !== eventId || (version && record.id !== version))
    throw new Error('The published guide does not match this event and version');
  return record;
}
/** Only a network failure can fall back. A permission denial never exposes an old guide. */
export async function getPublishedContent(eventId: string, personId: string) {
  try {
    const latest = await versionedContent(eventId);
    const version = await versionedContent(eventId, latest.id);
    await Promise.allSettled(Object.values(version.images).map((path) => getContentImage(path)));
    rememberContentVersion({ eventId, personId, id: version.id });
    return { record: version, offline: false };
  } catch (error) {
    const pointer = contentPointer(eventId, personId);
    if (!(error instanceof NetworkError) || !pointer) throw error;
    return { record: await versionedContent(eventId, pointer), offline: true };
  }
}
export async function uploadContentImage(
  eventId: string,
  input: {
    file: File;
    body: CreateContentImageRequest;
  },
) {
  const response = await eventApi<{ data: unknown }>(eventId, '/content/images/upload', {
    method: 'POST',
    body: input.body,
  });
  const upload = ContentImageResponse.parse(response.data);
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
  form.append('file', input.file);
  const sent = await fetch(upload.url, { method: 'POST', body: form, credentials: 'omit' });
  if (!sent.ok) throw new Error('The floor plan could not be uploaded. Try again.');
  return upload.key;
}

export async function getContentImage(path: string): Promise<Blob> {
  if (!/^\/events\/[^/]+\/content\/assets\/[^/]+\/map-\d+$/.test(path))
    throw new Error('Invalid floor plan location');
  return apiBlob(path, { offlineContent: true });
}
