import type { ReissueCardRequest, ReissueCardResponse } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { createStamp, findCardRow, findCardWithStamps, updateCard } from '../data/repo.js';
import {
  assertDifferentCards,
  assertReplacementUnissued,
  replacementStatus,
  requireCard,
} from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { getCard } from './getCard.js';

type CardWithStamps = NonNullable<Awaited<ReturnType<typeof findCardWithStamps>>>;

/**
 * Copy the journey. New idempotency keys, because these are new rows for the
 * same real-world events and the originals' keys are already taken.
 */
async function copyStamps(
  tx: PrismaTransactionClient,
  original: CardWithStamps,
  replacementId: string,
): Promise<void> {
  for (const stamp of original.stampEvents) {
    await createStamp(tx, {
      missionCardId: replacementId,
      stationId: stamp.stationId,
      recordedById: stamp.recordedById,
      recordedAt: stamp.recordedAt,
      source: stamp.source,
      idempotencyKey: `reissue:${replacementId}:${stamp.stationId}`,
    });
  }
}

/**
 * Reissue against a lost card (PRODUCT_BRIEF §4.3).
 *
 * The stamps are carried over so the visitor does not have to walk the journey
 * again, and the original is voided in the same transaction so one journey can
 * never be redeemed twice. IC-level, because it moves a journey between two
 * physical objects.
 */
export async function reissueCard(
  shortCodeInput: string,
  request: ReissueCardRequest,
  audit: AuditContext,
): Promise<ReissueCardResponse> {
  const originalCode = normaliseShortCode(shortCodeInput);
  const replacementCode = normaliseShortCode(request.replacementShortCode);
  assertDifferentCards(originalCode, replacementCode);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const original = requireCard(await findCardWithStamps(tx, originalCode));
    const replacement = requireCard(
      await findCardRow(tx, replacementCode),
      'No replacement card with that code',
    );
    assertReplacementUnissued(replacement);

    await updateCard(tx, replacement.id, {
      status: replacementStatus(original.status),
      issuedAt: original.issuedAt ?? now,
      completedAt: original.completedAt,
      reissuedFromId: original.id,
    });
    await copyStamps(tx, original, replacement.id);
    await updateCard(tx, original.id, { status: 'VOIDED', voidedAt: now });

    await writeAudit(tx, {
      ...audit,
      action: 'card.reissue',
      entityType: 'MissionCard',
      entityId: replacement.id,
      before: { shortCode: originalCode, status: original.status },
      after: {
        shortCode: replacementCode,
        stampsCarriedOver: original.stampEvents.length,
        reason: request.reason,
      },
    });
    return { voidedCardId: original.id, stampsCarriedOver: original.stampEvents.length };
  });

  return { card: await getCard(replacementCode), ...result };
}
