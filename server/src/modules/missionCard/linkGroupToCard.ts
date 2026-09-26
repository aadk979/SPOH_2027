import type { PrismaTransactionClient } from '../../platform/db/client.js';

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
  link: { shortCode: string; issuedAt: Date },
): Promise<{ cardId: string | null; linkError: string | null }> {
  const card = await tx.missionCard.findUnique({
    where: { shortCode: link.shortCode.toUpperCase() },
    select: { id: true, status: true },
  });

  if (!card) {
    return { cardId: null, linkError: 'Card not found. The registrations were still recorded.' };
  }
  if (card.status === 'VOIDED') {
    return {
      cardId: null,
      linkError: 'That card has been voided. The registrations were still recorded.',
    };
  }

  await tx.missionCard.update({
    where: { id: card.id },
    data: { status: 'ISSUED', issuedAt: link.issuedAt },
  });
  return { cardId: card.id, linkError: null };
}
