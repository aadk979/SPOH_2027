import { assertCardProvenance } from '../domain/cardRules.js';
import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { findCardStatus, lockCard } from '../data/repo.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * The card presented at the gift desk, inside the redemption's transaction,
 * locked for the rest of it: two redemptions against one card then run in
 * turn, and the second sees the first (F03-007). Null when the code does not
 * resolve: at the desk that is a warning, never a refusal, because the
 * physical card is what authorises the gift.
 */
export async function findCardForRedemption(
  tx: PrismaTransactionClient,
  scope: EventScope,
  shortCodeInput: string,
) {
  const provenance = await captureProvenance(tx, scope);
  const shortCode = normaliseShortCode(shortCodeInput);
  await lockCard(tx, scope, shortCode);
  const card = await findCardStatus(tx, scope, shortCode);
  if (card) assertCardProvenance(card, provenance);
  return card;
}
