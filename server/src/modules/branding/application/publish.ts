import { randomUUID } from 'node:crypto';
import type { PublishBrandingRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { saveBranding } from '../data/repo.js';
import { REGISTRY_LIMIT, type Publication } from '../domain/registry.js';
import { prepareBranding, assertRegistryBudget, type BrandingActor } from './prepare.js';
import { brandingState } from './readBranding.js';
import { brandingStorage } from './storage.js';
import { draftAsset } from './assetBoundary.js';

export function publishBranding(request: PublishBrandingRequest, actor: BrandingActor) {
  return prisma.$transaction(async (tx) => {
    const { event, registry } = await prepareBranding(tx, { actor, action: 'Content.Publish', expectedVersion: request.expectedVersion });
    await lockReserved(tx, actor.scope, request.idempotencyKey);
    if (registry.publications.length >= REGISTRY_LIMIT) throw new ValidationError('The 32-publication branding limit preserves historical exports. Contact the platform administrator.');
    const id = randomUUID();
    const images = [];
    for (const asset of registry.draftAssets ?? []) images.push({ variant: asset.variant, body: await brandingStorage().read(draftAsset(actor.scope, asset)) });
    const assets = images.length ? await brandingStorage().put({ prefix: `content/${actor.scope.eventId}/branding/${id}`, images }) : null;
    const publication: Publication = { id, version: (registry.publications.at(-1)?.version ?? 0) + 1, accent: registry.draft.accent, alt: assets ? registry.draft.logoAlt : null, assets };
    const next = { ...registry, version: registry.version + 1, publishedId: id, publications: [...registry.publications, publication] };
    assertRegistryBudget(next);
    await saveBranding(actor.scope, { tx, registry: next });
    await writeAudit(tx, { ...actor.audit, action: 'branding.publish', entityType: 'Event', entityId: actor.scope.eventId, after: { publicationId: id, version: publication.version, hasLogo: !!assets, accent: publication.accent } });
    const response = { data: brandingState(event, next) };
    await settleReserved(tx, actor.scope, { key: request.idempotencyKey, statusCode: 200, body: response });
    return response;
  }, { isolationLevel: 'ReadCommitted', timeout: 30_000 });
}
