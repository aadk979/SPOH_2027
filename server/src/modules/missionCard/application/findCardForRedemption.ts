import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { findCardStatus, lockCard } from '../data/repo.js';
import { normaliseShortCode } from '../domain/shortCode.js';

/**
 * The card presented at the gift desk, inside the redemption's transaction,
 * locked for the rest of it: two redemptions against one card then run in
 * turn, and the second sees the first (F03-007). Null when the code does not
 * resolve: at the desk that is a warning, never a refusal, because the
 * physical card is what authorises the gift.
 */
export async function findCardForRedemption(tx: PrismaTransactionClient, shortCodeInput: string) {
  const shortCode = normaliseShortCode(shortCodeInput);
  await lockCard(tx, shortCode);
  return findCardStatus(tx, shortCode);
}
