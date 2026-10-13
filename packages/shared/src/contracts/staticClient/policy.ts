import { z } from 'zod';
import { validateStaticScriptHashes } from './manifest.js';

export const STATIC_CSP_MAX_BYTES = 8 * 1024;
export interface StaticClientPolicyInput {
  scriptHashes: readonly string[];
  apiOrigin: string;
  mediaOrigin: string | null;
}
const normalizedUrl = z.url({ normalize: true });
function origin(value: string): boolean {
  const parsed = normalizedUrl.safeParse(value);
  return /^https?:\/\/[^/?#\s@\\]+$/.test(value) && parsed.success && parsed.data === `${value}/`;
}
/** Only the trusted bucket helper's exact commercial regional S3 origin may be advertised. */
export function isStaticMediaOrigin(value: string): boolean {
  return /^https:\/\/[a-z0-9][a-z0-9-]{1,61}[a-z0-9]\.s3\.(?!cn-)[a-z]{2}-(?:[a-z]+-)+[1-9]\d*\.amazonaws\.com$/.test(value);
}
export function staticClientCsp({ scriptHashes, apiOrigin, mediaOrigin }: StaticClientPolicyInput): string {
  validateStaticScriptHashes(scriptHashes);
  if ((apiOrigin !== '' && !origin(apiOrigin)) || (mediaOrigin !== null && !isStaticMediaOrigin(mediaOrigin)))
    throw new Error('Invalid static CSP origin');
  const api = apiOrigin ? [apiOrigin] : [];
  const media = mediaOrigin ? [mediaOrigin] : [];
  const policy = [
    "default-src 'self'", ["script-src 'self'", ...scriptHashes].join(' '),
    "script-src-attr 'none'", ["style-src 'self'", ...api].join(' '), "style-src-attr 'none'",
    ["img-src 'self' data: blob:", ...media, ...api].join(' '), "font-src 'self' data:",
    ["connect-src 'self'", ...api, ...media].join(' '), ["manifest-src 'self'", ...api].join(' '),
    "worker-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; ');
  // Canonical origins, directives and hash tokens are ASCII, so length is UTF-8 bytes.
  if (policy.length > STATIC_CSP_MAX_BYTES)
    throw new Error('Static CSP exceeds the 8 KiB header budget');
  return policy;
}

/** Leave a further 1 KiB beyond the CSP allowance for the other custom response headers. */
export const STATIC_HEADER_MAX_BYTES = 9 * 1024;
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}
export function validateStaticHeaderBudget(headers: Readonly<Record<string, string | number | readonly string[] | undefined>>): void {
  let total = 0;
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    for (const part of Array.isArray(value) ? value : [String(value)])
      total += utf8Bytes(name) + 2 + utf8Bytes(String(part)) + 2;
  }
  if (total > STATIC_HEADER_MAX_BYTES) throw new Error('Static response exceeds the 9 KiB custom header budget');
}
