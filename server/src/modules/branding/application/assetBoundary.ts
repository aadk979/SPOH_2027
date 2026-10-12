import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { StoredAsset } from '../domain/registry.js';

export function approvedAsset(scope: EventScope, input: { publicationId: string; asset: StoredAsset }): StoredAsset {
  if (input.asset.key !== `content/${scope.eventId}/branding/${input.publicationId}/${input.asset.variant}.png`) throw new NotFoundError('Published logo');
  return input.asset;
}
export function draftAsset(scope: EventScope, asset: StoredAsset): StoredAsset {
  const prefix = `drafts/${scope.eventId}/branding-normalized/`;
  const tail = asset.key.startsWith(prefix) ? asset.key.slice(prefix.length) : '';
  if (!new RegExp(`^[a-f0-9-]{36}/${asset.variant}\\.png$`).test(tail)) throw new NotFoundError('Draft logo');
  return asset;
}
