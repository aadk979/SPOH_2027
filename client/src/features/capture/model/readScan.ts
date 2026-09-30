import { CardShortCode } from '@spoh/shared';

export type Scan = { kind: 'code'; code: string } | { kind: 'payload'; payload: string };

/**
 * What the scanner read. A bare code is read with the printed alphabet's rule,
 * as typed codes are (F03-020). A printed card's QR holds an opaque payload
 * (`<namespace>:<uuid>`) unrelated to its code, so that goes to the server to
 * resolve (F03-045); slicing a code out of it named a card that does not exist.
 */
export function readScan(text: string): Scan | null {
  const cleaned = text.trim();
  const bare = CardShortCode.safeParse(cleaned);
  if (bare.success) return { kind: 'code', code: bare.data };
  const tail = cleaned.slice(cleaned.indexOf(':') + 1);
  return cleaned.includes(':') && tail.trim() ? { kind: 'payload', payload: cleaned } : null;
}
