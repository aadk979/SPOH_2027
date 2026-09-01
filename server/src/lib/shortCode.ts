import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Mission Card identifiers (PRODUCT_BRIEF §4.4).
 *
 * Codes are generated in a batch at production time and printed on the card.
 * They are never generated at the booth, because a card has to survive being
 * put in a pocket on 6 January and brought back on 8 January, on a different
 * device, and still resolve to the same journey.
 */

/**
 * Crockford-style alphabet with I, L, O and U removed.
 *
 * I/1, O/0 and L/1 are the pairs a volunteer will confuse when reading a
 * scuffed card under hall lighting, and the short code is the fallback for
 * exactly the case where the QR will not scan — so it has to be readable on the
 * first try. U is dropped because it makes accidental words less likely.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 6;

/** 32^6 ≈ 1.07 billion. At a few thousand cards, collisions are negligible. */
export const SHORT_CODE_SPACE = ALPHABET.length ** CODE_LENGTH;

/**
 * A cryptographically random short code.
 *
 * Rejection sampling rather than modulo: the alphabet is 32 characters, which
 * divides 256 evenly, so a plain modulo would be unbiased here — but the
 * alphabet is the kind of thing that gets edited, and a biased generator that
 * only becomes biased after a one-character change is a bad trap to leave.
 */
export function generateShortCode(): string {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let code = '';

  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= max) continue;
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
  }

  return code;
}

/**
 * The QR payload.
 *
 * Deliberately opaque and unrelated to the short code: it is a random
 * identifier, not a URL and not derived from anything about a visitor. Printing
 * a scannable link would invite a visitor to scan their own card and reach a
 * system that has no visitor-facing surface at all.
 */
export function generateQrPayload(): string {
  return `spoh2027:${randomUUID()}`;
}

/** Normalise anything a volunteer typed or a scanner read into a short code. */
export function normaliseShortCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}
