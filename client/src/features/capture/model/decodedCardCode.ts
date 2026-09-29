import { CardShortCode } from '@spoh/shared';

/**
 * The card code in what the scanner read. A bare code is read with the printed
 * alphabet's rule, as typed codes are (F03-020); anything else keeps the old
 * `prefix:code` reading.
 */
export function decodedCardCode(text: string): string | undefined {
  const cleaned = text.trim();
  const bare = CardShortCode.safeParse(cleaned);
  if (bare.success) return bare.data;
  return cleaned.split(':').pop()?.slice(0, 6).toUpperCase();
}
