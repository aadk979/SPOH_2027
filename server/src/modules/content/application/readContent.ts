import type { ContentVersionQuery } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toContentDraft, toPublishedContent } from '../data/mappers.js';
import { draftRow, publishedRow, versionRows } from '../data/repo.js';
import { CONTENT_KEYS } from '../domain/contentRules.js';
import { contentStorage } from './storage.js';

export async function readContentDraft(scope: EventScope) {
  return { data: toContentDraft(scope.eventId, await draftRow(scope)) };
}
export async function readPublishedContent(scope: EventScope, query: ContentVersionQuery) {
  const row = await publishedRow(scope, { ...(query.v ? { id: query.v } : {}) });
  if (!row) throw new NotFoundError('Published content');
  return { data: toPublishedContent(row) };
}
export async function readContentHistory(scope: EventScope) {
  return { data: (await versionRows(scope)).map(toPublishedContent) };
}
export async function readImmutableContent(
  scope: EventScope,
  input: { versionId: string; image?: string },
) {
  const row = await publishedRow(scope, { id: input.versionId });
  if (!row) throw new NotFoundError('Published content');
  const key = input.image ? `content/${scope.eventId}/${row.id}/${input.image}` : row.objectKey;
  const document = toPublishedContent(row);
  if (input.image && !document.body.map.levels.some((level) => level.image?.mediaKey === key))
    throw new NotFoundError('Published floor plan');
  return { ...(await contentStorage().read(key)), etag: input.image ? undefined : row.etag };
}
export async function contentReadiness(tx: PrismaTransactionClient, scope: EventScope) {
  const publication = await publishedRow(scope, {}, tx);
  return {
    requiredKeys: CONTENT_KEYS,
    documents: CONTENT_KEYS.map((key) => ({
      key,
      publishedVersion: publication?.id ?? null,
      publishedAtMs: publication?.publishedAt.getTime() ?? null,
    })),
  };
}
