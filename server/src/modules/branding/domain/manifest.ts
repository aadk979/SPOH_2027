import type { PublicBranding } from '@spoh/shared';

export function trustedOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && (value === parsed.origin || value === `${parsed.origin}/`) ? parsed.origin : null;
  } catch { return null; }
}
/** Manifest navigation always belongs to the validated client origin, never Host/Origin. */
export function brandingManifest(brand: PublicBranding, origins: { client: string; api: string }) {
  const workspace = new URL(`/e/${encodeURIComponent(brand.slug)}/`, origins.client).href;
  return { id: workspace, name: brand.name, short_name: brand.name.slice(0, 24), description: `Event operations for ${brand.name}`, start_url: `${workspace}home`, scope: workspace, display: 'standalone', background_color: '#ffffff', theme_color: brand.accent,
    icons: brand.icons.map((icon) => ({ src: new URL(icon.path, origins.api).href, sizes: icon.size, type: 'image/png', purpose: icon.purpose })) };
}
