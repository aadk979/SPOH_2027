import { captureProvenance } from '../../../platform/db/captureProvenance.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { findCardRow, updateCard } from '../data/repo.js';
import { isOutOfUse } from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/**
 * Link a group registration to the Mission Card the booth handed over, inside
 * the registration's transaction (PRODUCT_BRIEF §2.2).
 *
 * Best-effort on purpose: a card that cannot be found, or was voided, leaves
 * the registrations standing with only that card's journey untracked. An
 * optional path must never block a mandatory one (§2.3). The reason comes back
 * as `linkError` for the booth to show.
 */
export async function linkGroupToCard(
  tx: PrismaTransactionClient,
  scope: EventScope,
  link: { shortCode?: string; issuedAt: Date },
): Promise<{ cardId: string | null; linkError: string | null }> {
  if (!link.shortCode) return { cardId: null, linkError: null };
  const provenance = await captureProvenance(tx, scope);
  const card = await findCardRow(tx, scope, normaliseShortCode(link.shortCode));

  if (!card) {
    return { cardId: null, linkError: 'Card not found. The registrations were still recorded.' };
  }
  if (card.rehearsal !== provenance.rehearsal) {
    return {
      cardId: null,
      linkError:
        'The card belongs to a different rehearsal/live batch. The registrations were still recorded.',
    };
  }
  if (isOutOfUse(card.status)) {
    return {
      cardId: null,
      linkError: 'That card has been voided. The registrations were still recorded.',
    };
  }

  // Only a card the booth has not issued yet becomes ISSUED. A card already on
  // its journey keeps its status: linking a completed card reset it to ISSUED
  // and its visitor lost their completion (F03-004).
  if (card.status === 'UNISSUED') {
    await updateCard(tx, scope, {
      id: card.id,
      data: { status: 'ISSUED', issuedAt: link.issuedAt },
    });
  }
  return { cardId: card.id, linkError: null };
}
