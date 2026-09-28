import type { UploadPurpose } from '@spoh/shared';

const EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

/** Where each purpose stores its objects. Date-partitioned, for lifecycle rules. */
const PREFIXES: Readonly<Record<UploadPurpose, string>> = Object.freeze({
  lostFound: 'lost-found',
});

/**
 * Keys are generated, never accepted.
 *
 * Date-partitioned so the bucket's lifecycle policy can expire a whole event's
 * photos, and random within the day so a key cannot be guessed from knowing
 * when an item was logged.
 */
export function buildKey(
  upload: { purpose: UploadPurpose; contentType: string },
  at: Date,
  randomId: string,
): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const day = String(at.getUTCDate()).padStart(2, '0');

  return `${PREFIXES[upload.purpose]}/${year}/${month}/${day}/${randomId}.${EXTENSIONS[upload.contentType]}`;
}

/**
 * Only keys under a known prefix may be signed for reading. Without that, the
 * read route would sign a URL for any object in the bucket for any caller who
 * could guess a key — including anything else that ever lands there.
 */
export function isReadableKey(key: string): boolean {
  const known = Object.values(PREFIXES).some((prefix) => key.startsWith(`${prefix}/`));
  return known && !key.includes('..');
}
