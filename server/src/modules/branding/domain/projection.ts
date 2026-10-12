import type { FrozenBranding, PublicBranding } from '@spoh/shared';
import { currentPublication, NEUTRAL_ACCENT, type BrandingRegistry, type Publication } from './registry.js';

export function brandingPaths(slug: string, id: string) {
  const base = `/api/v1/public/events/${encodeURIComponent(slug)}/branding`;
  return { base, asset: (variant: string) => `${base}/assets/${encodeURIComponent(id)}/${variant}`, theme: `${base}/theme.css?v=${encodeURIComponent(id)}`, manifest: `${base}/manifest.webmanifest` };
}
export function publicProjection(event: { slug: string; name: string }, publication: Publication): PublicBranding {
  const paths = brandingPaths(event.slug, publication.id);
  return { slug: event.slug, name: event.name, accent: publication.accent, publicationId: publication.id, publicationVersion: publication.version,
    logo: publication.assets ? { path: paths.asset('logo'), alt: publication.alt! } : null,
    icons: publication.assets ? [
      { path: paths.asset('icon-192'), size: '192x192', purpose: 'any' },
      { path: paths.asset('icon-512'), size: '512x512', purpose: 'any' },
      { path: paths.asset('maskable-512'), size: '512x512', purpose: 'maskable' },
    ] : [], themePath: paths.theme, manifestPath: paths.manifest };
}
export function frozenProjection(registry: BrandingRegistry): FrozenBranding {
  const publication = currentPublication(registry);
  const logo = publication?.assets?.find((asset) => asset.variant === 'logo');
  return { schemaVersion: 1, publicationId: publication?.id ?? null, publicationVersion: publication?.version ?? null, accent: publication?.accent ?? NEUTRAL_ACCENT,
    logo: logo ? { publicationId: publication!.id, variant: 'logo', sha256: logo.sha256, alt: publication!.alt! } : null };
}
