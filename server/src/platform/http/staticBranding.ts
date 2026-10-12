import { createHash } from 'node:crypto';
import { EventSlug, isClientConfigOrigin, type PublicBranding } from '@spoh/shared';

export type StaticBrandingReader = (slug: string) => Promise<{ data: PublicBranding; etag: string } | null>;
/** Return-to is a same-site app path, never a remotely supplied host or asset source. */
export function brandingSlugFromAddress(address: string): string | null {
  const url = new URL(address, 'https://static.example.invalid');
  const path = url.pathname === '/sign-in' ? url.searchParams.get('returnTo') : url.pathname;
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  const match = /^\/e\/([^/?#]+)(?:\/|$)/.exec(path);
  const parsed = EventSlug.safeParse(match?.[1]);
  return parsed.success ? parsed.data : null;
}
const escape = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
function apiAsset(path: string, origin: string): string {
  if (!/^\/api\/v1\/public\/events\/[A-Za-z0-9_-]+\/branding\//.test(path)) throw new Error('Invalid approved brand asset path');
  return `${isClientConfigOrigin(origin) ? origin : ''}${path}`;
}
function headTags(brand: PublicBranding, origin: string): string {
  const marked = ' data-event-branding="true"';
  const assets = brand.icons.map((icon) => `<link${marked} rel="icon" sizes="${icon.size}" href="${escape(apiAsset(icon.path, origin))}" crossorigin="anonymous">`).join('');
  return `<title${marked}>${escape(brand.name)}</title><meta${marked} name="theme-color" content="${brand.accent}">` +
    `<meta${marked} name="apple-mobile-web-app-title" content="${escape(brand.name)}">` +
    `<link${marked} rel="stylesheet" href="${escape(apiAsset(brand.themePath, origin))}" crossorigin="anonymous">` +
    `<link${marked} rel="manifest" href="${escape(apiAsset(brand.manifestPath, origin))}" crossorigin="anonymous">${assets}`;
}
/** Only markup is rewritten. Exact inline script bytes remain valid for P15 hashes. */
function rewriteHeadMarkup(head: string): string {
  return head.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b(?=[^>]*\bname=["'](?:theme-color|apple-mobile-web-app-title)["'])[^>]*>/gi, '')
    .replace(/<link\b(?=[^>]*\brel=["'](?:manifest|icon)["'])[^>]*>/gi, '');
}
export function brandedHtml(html: string, brand: PublicBranding, origin: string): string {
  const close = Array.from(html.matchAll(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<\/head>/gi))
    .find((match) => /^<\/head>$/i.test(match[0]))?.index ?? -1;
  if (close < 0) return html;
  const head = html.slice(0, close);
  const preserved = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi;
  let result = ''; let offset = 0;
  for (const match of head.matchAll(preserved)) {
    result += rewriteHeadMarkup(head.slice(offset, match.index)) + match[0];
    offset = match.index + match[0].length;
  }
  return result + rewriteHeadMarkup(head.slice(offset)) + headTags(brand, origin) + html.slice(close);
}
export const htmlEtag = (body: string) => `"${createHash('sha256').update(body).digest('hex')}"`;
