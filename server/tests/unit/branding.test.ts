import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { brandingCss, colourContrast } from '../../src/modules/branding/domain/theme.js';
import { brandingManifest, trustedOrigin } from '../../src/modules/branding/domain/manifest.js';
import { currentPublication, emptyRegistry, readRegistry } from '../../src/modules/branding/domain/registry.js';
import { frozenProjection, publicProjection } from '../../src/modules/branding/domain/projection.js';
import { normalizeBrandingImage } from '../../src/modules/branding/application/images.js';
import { approvedAsset, draftAsset } from '../../src/modules/branding/application/assetBoundary.js';

const publication = { id: 'publication', version: 1, accent: '#ff0000', alt: null, assets: null };
describe('approved branding boundaries', () => {
  it('refuses to treat malformed or arbitrary legacy JSON as approval', () => {
    expect(readRegistry({ logo: 'https://remote.test/private', accent: 'red' })).toEqual(emptyRegistry());
    expect(frozenProjection(emptyRegistry())).toEqual({ schemaVersion: 1, publicationId: null, publicationVersion: null, accent: '#0066cc', logo: null });
    expect(currentPublication(emptyRegistry())).toBeNull();
    expect(readRegistry({ ...emptyRegistry(), publishedId: 'missing' }).publishedId).toBeNull();
  });
  it.each(['#ffffff', '#000000', '#ff0000', '#0066cc', '#00ff00'])('derives contrast-safe text/buttons from %s without safety declarations', (accent) => {
    const css = brandingCss(accent);
    const light = /:root\{--color-primary:(#[a-f0-9]{6})/.exec(css)![1]!;
    const dark = /\[data-theme="dark"\]\{--color-primary:(#[a-f0-9]{6})/.exec(css)![1]!;
    expect(colourContrast(light, '#ffffff')).toBeGreaterThanOrEqual(7);
    expect(colourContrast(dark, '#272729')).toBeGreaterThanOrEqual(7);
    expect(css).not.toContain('--color-alert');
    expect(css).not.toContain('url(');
    expect(css).toContain('@media(prefers-color-scheme:dark)');
  });
  it('builds manifest navigation at the client origin and assets at the API origin', () => {
    const brand = publicProjection({ slug: 'open-day', name: '<Open & Day>' }, publication);
    const manifest = brandingManifest(brand, { client: 'https://client.example.test', api: 'https://api.example.test' });
    expect(manifest).toMatchObject({ id: 'https://client.example.test/e/open-day/', start_url: 'https://client.example.test/e/open-day/home', scope: 'https://client.example.test/e/open-day/', name: '<Open & Day>' });
    expect(trustedOrigin('https://api.example.test/')).toBe('https://api.example.test');
    for (const value of ['https://user:password@example.test', 'https://example.test/path', 'https://example.test?x=1', 'javascript:alert(1)', 'not a URL']) expect(trustedOrigin(value)).toBeNull();
  });
  it('checks stored asset namespaces against the event and approved publication', () => {
    const asset = { variant: 'logo' as const, key: 'content/event-a/branding/publication/logo.png', versionId: null, sha256: 'a'.repeat(64), bytes: 10 };
    expect(approvedAsset({ eventId: 'event-a' }, { publicationId: 'publication', asset })).toBe(asset);
    expect(() => approvedAsset({ eventId: 'event-b' }, { publicationId: 'publication', asset })).toThrow();
    expect(() => approvedAsset({ eventId: 'event-a' }, { publicationId: 'foreign', asset })).toThrow();
    expect(() => draftAsset({ eventId: 'event-a' }, asset)).toThrow();
    expect(draftAsset({ eventId: 'event-a' }, { ...asset, key: 'drafts/event-a/branding-normalized/11111111-1111-4111-8111-111111111111/logo.png' })).toMatchObject({ variant: 'logo' });
  });
  it('rejects approved-logo registries without text and non-monotonic publication history', () => {
    const assets = ['logo', 'icon-192', 'icon-512', 'maskable-512'].map((variant) => ({ variant,
      key: `content/event/publication/${variant}.png`, versionId: null, sha256: 'a'.repeat(64), bytes: 10 }));
    const registry = { ...emptyRegistry(), publishedId: 'publication', publications: [{ ...publication, assets }] };
    expect(readRegistry(registry)).toEqual(emptyRegistry());
    expect(readRegistry({ ...registry, publications: [{ ...publication, alt: 'Mark', assets }] }).publishedId).toBe('publication');
    expect(readRegistry({ ...emptyRegistry(), publications: [{ ...publication, id: 'older', version: 2 },
      { ...publication, id: 'newer', version: 1 }] })).toEqual(emptyRegistry());
  });
});
describe('branding raster normalization', () => {
  it('strips metadata and creates exact PNG logo/icon/maskable variants', async () => {
    const body = await sharp({ create: { width: 240, height: 80, channels: 4, background: '#0066cc' } }).withMetadata().png().toBuffer();
    const results = await normalizeBrandingImage({ body, contentType: 'image/png' });
    expect(results.map((item) => item.variant)).toEqual(['logo', 'icon-192', 'icon-512', 'maskable-512']);
    const metadata = await Promise.all(results.map((item) => sharp(item.body).metadata()));
    expect(metadata.map((item) => [item.format, item.width, item.height])).toEqual([['png', 240, 80], ['png', 192, 192], ['png', 512, 512], ['png', 512, 512]]);
    for (const item of metadata) { expect(item.exif).toBeUndefined(); expect(item.icc).toBeUndefined(); }
    const { data, info } = await sharp(results[3]!.body).raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, info.channels)]).toEqual([255, 255, 255, 255]);
  });
  it('rejects declared MIME mismatches, corrupt bytes, oversized dimensions and excess input bytes', async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#000000' } }).png().toBuffer();
    await expect(normalizeBrandingImage({ body: png, contentType: 'image/jpeg' })).rejects.toThrow('single');
    await expect(normalizeBrandingImage({ body: Buffer.from('not an image'), contentType: 'image/png' })).rejects.toThrow('decoded');
    await expect(normalizeBrandingImage({ body: new Uint8Array(1024 * 1024 + 1), contentType: 'image/png' })).rejects.toThrow('1 MB');
    const large = await sharp({ create: { width: 4097, height: 1, channels: 4, background: '#000000' } }).png().toBuffer();
    await expect(normalizeBrandingImage({ body: large, contentType: 'image/png' })).rejects.toThrow('4096');
  });
  it('rejects a genuine animated WebP instead of silently publishing its first frame', async () => {
    // Distinct frames prevent the encoder collapsing identical pages to a static image.
    const pixels = Buffer.concat([Buffer.alloc(400, Buffer.from([0, 102, 204, 255])), Buffer.alloc(400, Buffer.from([204, 0, 0, 255]))]);
    const body = await sharp(pixels, { raw: { width: 10, height: 20, pageHeight: 10, channels: 4 } }).webp().toBuffer();
    expect((await sharp(body, { animated: true }).metadata()).pages).toBe(2);
    await expect(normalizeBrandingImage({ body, contentType: 'image/webp' })).rejects.toThrow('single');
  });
});
