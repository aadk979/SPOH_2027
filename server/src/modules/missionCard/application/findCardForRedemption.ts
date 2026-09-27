import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { findCardStatus } from '../data/repo.js';
import { normaliseShortCode } from '../domain/shortCode.js';

/**
 * The card presented at the gift desk, inside the redemption's transaction.
 * Null when the code does not resolve: at the desk that is a warning, never a
 * refusal, because the physical card is what authorises the gift.
 */
export async function findCardForRedemption(tx: PrismaTransactionClient, shortCodeInput: string) {
  return findCardStatus(tx, normaliseShortCode(shortCodeInput));
}
