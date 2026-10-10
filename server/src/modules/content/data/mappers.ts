import { EventContent, type ContentDraftRecord, type PublishedContentRecord } from '@spoh/shared';
import type { ContentDocument, ContentVersion } from '../../../generated/prisma/client.js';

export function toContentDraft(eventId: string, row: ContentDocument | null): ContentDraftRecord {
  if (!row)
    return {
      eventId,
      version: 0,
      body: null,
      reviewedVersion: null,
      reviewedAt: null,
      publishedVersion: null,
      updatedAt: null,
    };
  return {
    eventId,
    version: row.version,
    body: EventContent.parse(row.body),
    reviewedVersion: row.reviewedVersion,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    publishedVersion: row.publishedVersionId,
    updatedAt: row.updatedAt.toISOString(),
  };
}
function publishedImages(input: { eventId: string; id: string; body: EventContent }) {
  return Object.fromEntries(
    input.body.map.levels.flatMap(({ image }) => {
      if (!image) return [];
      const name = image.mediaKey.split('/').at(-1);
      return [[image.mediaKey, `/events/${input.eventId}/content/assets/${input.id}/${name}`]];
    }),
  );
}
export function toPublishedContent(row: ContentVersion): PublishedContentRecord {
  const body = EventContent.parse(row.body);
  return {
    id: row.id,
    eventId: row.eventId,
    version: row.version,
    draftVersion: row.draftVersion,
    body,
    objectKey: row.objectKey,
    publishedAt: row.publishedAt.toISOString(),
    etag: row.etag,
    path: `/events/${row.eventId}/content?v=${row.id}`,
    images: publishedImages({ eventId: row.eventId, id: row.id, body }),
  };
}
