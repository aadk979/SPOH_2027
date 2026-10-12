import { createHash } from 'node:crypto';
import { EventSlug, FrozenBranding, type BrandingState, type BrandingVariant } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { eventBranding, publicCandidates } from '../data/repo.js';
import { currentPublication, readRegistry, REGISTRY_LIMIT, type BrandingRegistry } from '../domain/registry.js';
import { frozenProjection, publicProjection } from '../domain/projection.js';
import { brandingStorage } from './storage.js';
import { approvedAsset, draftAsset } from './assetBoundary.js';

export function brandingState(event: { id: string; slug: string; name: string }, registry: BrandingRegistry): BrandingState {
  const published = currentPublication(registry);
  return { eventId: event.id, version: registry.version, draft: registry.draft, published: published ? publicProjection(event, published) : null, registryRemaining: REGISTRY_LIMIT - registry.publications.length };
}
export async function readBranding(scope: EventScope) {
  const event = await eventBranding(scope);
  return { data: brandingState(event, readRegistry(event.branding)) };
}
async function exactPublic(slug: string) {
  const parsed = EventSlug.safeParse(slug);
  if (!parsed.success) return null;
  const events = await publicCandidates(parsed.data);
  if (events.length !== 1) return null;
  const event = events[0]!;
  return { event, registry: readRegistry(event.branding) };
}
export async function publicBrandingForSlug(slug: string) {
  const found = await exactPublic(slug);
  const publication = found && currentPublication(found.registry);
  if (!found || !publication) return null;
  const data = publicProjection(found.event, publication);
  return { data, etag: `"${createHash('sha256').update(JSON.stringify(data)).digest('hex')}"` };
}
export async function readPublicPublication(input: { slug: string; publicationId?: string }) {
  const found = await exactPublic(input.slug);
  if (!found?.registry.publishedId) throw new NotFoundError('Published branding');
  const publication = input.publicationId ? found.registry.publications.find((item) => item.id === input.publicationId) : currentPublication(found.registry);
  if (!publication) throw new NotFoundError('Published branding');
  return { event: found.event, publication };
}
export async function readPublicAsset(input: { slug: string; publicationId: string; variant: BrandingVariant }) {
  const { event, publication } = await readPublicPublication(input);
  const asset = publication.assets?.find((item) => item.variant === input.variant);
  if (!asset) throw new NotFoundError('Published branding');
  return { body: await brandingStorage().read(approvedAsset({ eventId: event.id }, { publicationId: publication.id, asset })), etag: `"${asset.sha256}"` };
}
export async function readDraftAsset(scope: EventScope, variant: BrandingVariant) {
  const event = await eventBranding(scope);
  const asset = readRegistry(event.branding).draftAssets?.find((item) => item.variant === variant);
  if (!asset) throw new NotFoundError('Draft logo');
  return brandingStorage().read(draftAsset(scope, asset));
}
export async function freezeBranding(scope: EventScope, tx: PrismaTransactionClient) {
  return frozenProjection(readRegistry((await eventBranding(scope, tx)).branding));
}
export async function readFrozenBrandingLogo(scope: EventScope, frozen: FrozenBranding | null | undefined): Promise<Uint8Array | null> {
  if (!frozen?.logo) return null;
  const parsed = FrozenBranding.parse(frozen);
  const event = await eventBranding(scope, prisma);
  const publication = readRegistry(event.branding).publications.find((item) => item.id === parsed.publicationId && item.version === parsed.publicationVersion);
  const asset = publication?.assets?.find((item) => item.variant === 'logo' && item.sha256 === parsed.logo!.sha256);
  if (!asset) throw new NotFoundError('Frozen export logo');
  return brandingStorage().read(approvedAsset(scope, { publicationId: publication!.id, asset }));
}
