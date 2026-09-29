import { z } from 'zod';
import { CardShortCode } from '@spoh/shared';

/**
 * A typed card code, read by the shared card-code schema: the look-alikes O, I
 * and L become the digits the card prints, and a letter the alphabet never
 * prints is refused with the server's own message (F03-020).
 */
export const CardCodeEntry = z.object({ code: CardShortCode });
