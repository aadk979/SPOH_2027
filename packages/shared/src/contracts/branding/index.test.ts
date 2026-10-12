import { describe, expect, it } from 'vitest';
import { BrandingDraft, BrandingUploadRequest, FrozenBranding, PublicBranding, SaveBrandingRequest } from './index.js';

const draft = { accent: '#0066CC', logoAlt: null, uploadReceiptId: null };
describe('branding publication contracts', () => {
  it('normalizes the colour and requires an accessible description for uploads', () => {
    expect(BrandingDraft.parse(draft).accent).toBe('#0066cc');
    expect(BrandingDraft.safeParse({ ...draft, uploadReceiptId: 'receipt' }).success).toBe(false);
    expect(BrandingDraft.parse({ ...draft, logoAlt: ' Mark ', uploadReceiptId: 'receipt' }).logoAlt).toBe('Mark');
  });
  it.each(['red', '#fff', '#000000;display:none', 'url(https://example.test)', 'var(--colour)'])('rejects unsafe accent %s', (accent) => {
    expect(BrandingDraft.safeParse({ ...draft, accent }).success).toBe(false);
  });
  it('refuses raw object paths, unrelated fields and malformed retry/version inputs', () => {
    expect(BrandingDraft.safeParse({ ...draft, logoUrl: 'https://external.test/logo' }).success).toBe(false);
    expect(SaveBrandingRequest.safeParse({ expectedVersion: -1, idempotencyKey: 'not-a-uuid', body: draft }).success).toBe(false);
    expect(BrandingUploadRequest.safeParse({ expectedVersion: 0, idempotencyKey: '11111111-1111-4111-8111-111111111111', contentType: 'image/svg+xml', contentLength: 100 }).success).toBe(false);
    expect(BrandingUploadRequest.safeParse({ expectedVersion: 0, idempotencyKey: '11111111-1111-4111-8111-111111111111', contentType: 'image/png', contentLength: 1024 * 1024 + 1 }).success).toBe(false);
  });
  it('distinguishes neutral new exports from missing legacy history and binds the logo to a publication', () => {
    const neutral = { schemaVersion: 1, publicationId: null, publicationVersion: null, accent: '#0066cc', logo: null };
    expect(FrozenBranding.parse(neutral)).toEqual(neutral);
    expect(FrozenBranding.safeParse({ ...neutral, publicationVersion: 1 }).success).toBe(false);
    const branded = { ...neutral, publicationId: 'publication', publicationVersion: 1, logo: { publicationId: 'foreign', variant: 'logo', sha256: 'a'.repeat(64), alt: 'Mark' } };
    expect(FrozenBranding.safeParse(branded).success).toBe(false);
    expect(FrozenBranding.safeParse({ ...branded, logo: { ...branded.logo, publicationId: 'publication', objectKey: 'private/key' } }).success).toBe(false);
  });
  it('keeps the public DTO free of private event, draft, upload and storage metadata', () => {
    const base = '/api/v1/public/events/open-day/branding/';
    const publicBrand = { slug: 'open-day', name: 'Open day', accent: '#0066cc', publicationId: 'publication', publicationVersion: 1, logo: null, icons: [], themePath: `${base}theme.css?v=publication`, manifestPath: `${base}manifest.webmanifest` };
    expect(PublicBranding.parse(publicBrand)).toEqual(publicBrand);
    for (const key of ['eventId', 'organisationId', 'status', 'draft', 'objectKey', 'uploadReceiptId']) expect(PublicBranding.safeParse({ ...publicBrand, [key]: 'private' }).success).toBe(false);
    expect(PublicBranding.safeParse({ ...publicBrand, themePath: 'https://external.test/theme' }).success).toBe(false);
  });
});
