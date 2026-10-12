import type { PublicBranding } from '@spoh/shared';
import { publicBrandingUrl } from '../api';

const DESCRIPTION = 'Shifts, capture, safety and reports for the volunteers who run an event.';
function meta(name: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!element) { element = document.createElement('meta'); element.name = name; document.head.append(element); }
  element.content = content;
}
function manifest(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!element) { element = document.createElement('link'); element.rel = 'manifest'; document.head.append(element); }
  element.href = href;
  element.crossOrigin = 'anonymous';
}
export function clearBrandingHead(): void {
  document.head.querySelectorAll('[data-event-branding]').forEach((element) => element.remove());
  document.title = 'Volunteer operations';
  meta('description', DESCRIPTION);
  meta('theme-color', '#0066cc');
  meta('apple-mobile-web-app-title', 'Ops');
  manifest('/manifest.json');
}
function brandedLink(rel: string, href: string) {
  const element = document.createElement('link');
  element.rel = rel;
  element.href = href;
  element.crossOrigin = 'anonymous';
  element.setAttribute('data-event-branding', '');
  document.head.append(element);
}
/** Attributes/textContent do not parse event names as markup or alter Next inline scripts. */
export function applyBrandingHead(brand: PublicBranding, apiBaseUrl: string): void {
  clearBrandingHead();
  const url = (path: string) => publicBrandingUrl(path, { slug: brand.slug, apiBaseUrl });
  document.title = brand.name;
  meta('description', `Event operations for ${brand.name}`);
  meta('theme-color', brand.accent);
  meta('apple-mobile-web-app-title', brand.name);
  manifest(url(brand.manifestPath));
  brandedLink('stylesheet', url(brand.themePath));
  const icon = brand.icons.find((item) => item.size === '192x192');
  if (icon) { brandedLink('icon', url(icon.path)); brandedLink('apple-touch-icon', url(icon.path)); }
}
