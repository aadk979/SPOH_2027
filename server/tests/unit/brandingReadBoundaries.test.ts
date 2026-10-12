import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { frozenProjection, publicProjection } from '../../src/modules/branding/domain/projection.js';
import { emptyRegistry, type BrandingRegistry, type Publication } from '../../src/modules/branding/domain/registry.js';
import { useBrandingStorage, type BrandingStorage } from '../../src/modules/branding/application/storage.js';
import { freezeBranding, publicBrandingForSlug, readBranding, readDraftAsset, readFrozenBrandingLogo, readPublicAsset, readPublicPublication } from '../../src/modules/branding/application/readBranding.js';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
const repos = vi.hoisted(() => ({ eventBranding: vi.fn(), publicCandidates: vi.fn() }));
vi.mock('../../src/modules/branding/data/repo.js', () => repos);

const scope = { eventId: 'owned-event' };
const bytes = Uint8Array.from([137, 80, 78, 71]);
const publication: Publication = { id: 'approved', version: 1, accent: '#8844aa', alt: 'Approved mark',
  assets: ['logo', 'icon-192', 'icon-512', 'maskable-512'].map((variant) => ({
    variant: variant as 'logo' | 'icon-192' | 'icon-512' | 'maskable-512',
    key: `content/owned-event/branding/approved/${variant}.png`, versionId: null, sha256: 'a'.repeat(64), bytes: 4,
  })) };
const registry = (): BrandingRegistry => ({ ...emptyRegistry(), version: 1, publishedId: publication.id, publications: [publication] });
const event = (branding: unknown = registry()) => ({ id: scope.eventId, slug: 'owned-event', name: 'Approved event', branding });
const storage: BrandingStorage = { issue: vi.fn(), uploaded: vi.fn(), put: vi.fn(), read: vi.fn(async () => bytes) };
let restore: () => void;
beforeEach(() => {
  vi.clearAllMocks(); repos.eventBranding.mockResolvedValue(event()); repos.publicCandidates.mockResolvedValue([event()]);
  restore = useBrandingStorage(storage);
});
afterEach(() => restore());

it('never queries malformed public slugs, and never guesses which ambiguous event is public', async () => {
  for (const slug of ['../owned-event', 'owned/event', '_']) expect(await publicBrandingForSlug(slug)).toBeNull();
  expect(repos.publicCandidates).not.toHaveBeenCalled();
  for (const candidates of [[], [event(), { ...event(), id: 'foreign-event' }]]) {
    repos.publicCandidates.mockResolvedValue(candidates);
    expect(await publicBrandingForSlug('owned-event')).toBeNull();
    await expect(readPublicPublication({ slug: 'owned-event' })).rejects.toMatchObject({ statusCode: 404 });
  }
  expect(storage.read).not.toHaveBeenCalled();
});

it('returns only approved identity and selects historical publications explicitly', async () => {
  const next: Publication = { id: 'later', version: 2, accent: '#0066cc', alt: null, assets: null };
  repos.publicCandidates.mockResolvedValue([event({ ...registry(), version: 2, publishedId: next.id, publications: [publication, next] })]);
  expect((await publicBrandingForSlug('owned-event'))?.data).toEqual(publicProjection(event(), next));
  expect((await readPublicPublication({ slug: 'owned-event', publicationId: 'approved' })).publication).toEqual(publication);
  expect((await readPublicPublication({ slug: 'owned-event' })).publication).toEqual(next);
  await expect(readPublicPublication({ slug: 'owned-event', publicationId: 'foreign' })).rejects.toMatchObject({ statusCode: 404 });
  const asset = await readPublicAsset({ slug: 'owned-event', publicationId: 'approved', variant: 'logo' });
  expect(asset).toEqual({ body: bytes, etag: `"${'a'.repeat(64)}"` });
  expect(storage.read).toHaveBeenCalledExactlyOnceWith(publication.assets![0]);
  await expect(readPublicAsset({ slug: 'owned-event', publicationId: 'later', variant: 'logo' })).rejects.toMatchObject({ statusCode: 404 });
  expect(storage.read).toHaveBeenCalledOnce();
});

it('keeps unpublished, malformed and absent frozen branding neutral without reading arbitrary objects', async () => {
  repos.publicCandidates.mockResolvedValue([event({ logo: 'https://foreign.test/private.png' })]);
  expect(await publicBrandingForSlug('owned-event')).toBeNull();
  await expect(readPublicPublication({ slug: 'owned-event' })).rejects.toMatchObject({ statusCode: 404 });
  repos.eventBranding.mockResolvedValue(event(null));
  expect((await readBranding(scope)).data).toMatchObject({ eventId: scope.eventId, published: null, version: 0 });
  expect(await freezeBranding(scope, {} as PrismaTransactionClient)).toEqual(frozenProjection(emptyRegistry()));
  for (const frozen of [undefined, null, frozenProjection(emptyRegistry())]) expect(await readFrozenBrandingLogo(scope, frozen)).toBeNull();
  await expect(readDraftAsset(scope, 'logo')).rejects.toMatchObject({ statusCode: 404 });
  expect(storage.read).not.toHaveBeenCalled();
});

it('requires exact frozen publication version and digest before any logo I/O', async () => {
  const frozen = frozenProjection(registry());
  expect(await readFrozenBrandingLogo(scope, frozen)).toEqual(bytes);
  expect(storage.read).toHaveBeenCalledExactlyOnceWith(publication.assets![0]);
  vi.mocked(storage.read).mockClear();
  for (const changed of [{ ...frozen, publicationVersion: 2 }, { ...frozen, publicationId: 'foreign' },
    { ...frozen, logo: { ...frozen.logo!, sha256: 'b'.repeat(64) } }]) {
    await expect(readFrozenBrandingLogo(scope, changed)).rejects.toThrow();
  }
  expect(storage.read).not.toHaveBeenCalled();
});

it('refuses a stored cross-event asset namespace even if the registry looks valid', async () => {
  const foreign = { ...publication, assets: publication.assets!.map((asset) => ({ ...asset,
    key: asset.key.replace('owned-event', 'foreign-event') })) };
  repos.publicCandidates.mockResolvedValue([event({ ...registry(), publications: [foreign] })]);
  await expect(readPublicAsset({ slug: 'owned-event', publicationId: 'approved', variant: 'logo' })).rejects.toThrow();
  expect(storage.read).not.toHaveBeenCalled();
});

it('serves a private draft only through its issued exact event-owned normalized asset', async () => {
  const assets = publication.assets!.map((asset) => ({ ...asset,
    key: `drafts/owned-event/branding-normalized/11111111-1111-4111-8111-111111111111/${asset.variant}.png` }));
  repos.eventBranding.mockResolvedValue(event({ ...emptyRegistry(), draft: {
    accent: '#0066cc', logoAlt: 'Private draft', uploadReceiptId: 'receipt' }, draftAssets: assets }));
  expect(await readDraftAsset(scope, 'icon-192')).toEqual(bytes);
  expect(storage.read).toHaveBeenCalledExactlyOnceWith(assets[1]);
});
