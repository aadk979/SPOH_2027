/**
 * Mission Card short codes (PRODUCT_BRIEF §4.4): one alphabet and one reading
 * rule for the printer, the server and the input field (F03-020).
 *
 * Crockford-style: I, L, O and U are never printed, because I/1, L/1 and O/0
 * are what a volunteer confuses reading a scuffed card under hall lighting,
 * and U makes accidental words likelier.
 */
export const CARD_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CARD_CODE_LENGTH = 6;

/**
 * Read what a volunteer typed or a scanner read as a card code: upper case,
 * without spaces or hyphens, and with the look-alikes read as the digits the
 * card shows (O as 0, I and L as 1), as Crockford decoding does.
 */
export function normaliseCardCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}
