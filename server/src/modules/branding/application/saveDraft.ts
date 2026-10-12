import { randomUUID } from 'node:crypto';
import type { SaveBrandingRequest } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { ownedUpload, saveBranding } from '../data/repo.js';
import type { BrandingRegistry } from '../domain/registry.js';
import { normalizeBrandingImage } from './images.js';
import { prepareBranding, assertRegistryBudget, type BrandingActor } from './prepare.js';
import { brandingState } from './readBranding.js';
import { brandingStorage } from './storage.js';

async function draftImages(tx: PrismaTransactionClient, input: { request: SaveBrandingRequest; actor: BrandingActor; previous: BrandingRegistry }) {
  const { request, actor, previous } = input;
  const id = request.body.uploadReceiptId;
  if (!id) return null;
  if (previous.draft.uploadReceiptId === id && previous.draftAssets) return previous.draftAssets;
  const receipt = await ownedUpload(actor.scope, { tx, id, personId: actor.volunteerId });
  if (!receipt || receipt.key !== `drafts/${actor.scope.eventId}/branding/${id}`) throw new NotFoundError('Logo upload');
  const body = await brandingStorage().uploaded(receipt);
  const images = await normalizeBrandingImage({ body, contentType: receipt.contentType });
  return brandingStorage().put({ prefix: `drafts/${actor.scope.eventId}/branding-normalized/${randomUUID()}`, images });
}
export function saveBrandingDraft(request: SaveBrandingRequest, actor: BrandingActor) {
  return prisma.$transaction(async (tx) => {
    const { event, registry } = await prepareBranding(tx, { actor, action: 'Content.Edit', expectedVersion: request.expectedVersion });
    await lockReserved(tx, actor.scope, request.idempotencyKey);
    const next = { ...registry, version: registry.version + 1, draft: request.body, draftAssets: await draftImages(tx, { request, actor, previous: registry }) };
    assertRegistryBudget(next);
    await saveBranding(actor.scope, { tx, registry: next });
    await writeAudit(tx, { ...actor.audit, action: 'branding.draft', entityType: 'Event', entityId: actor.scope.eventId, before: { version: registry.version }, after: { version: next.version, hasLogo: !!next.draftAssets, accent: next.draft.accent } });
    const response = { data: brandingState(event, next) };
    await settleReserved(tx, actor.scope, { key: request.idempotencyKey, statusCode: 200, body: response });
    return response;
  }, { isolationLevel: 'ReadCommitted', timeout: 30_000 });
}
