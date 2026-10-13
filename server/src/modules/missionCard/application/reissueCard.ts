import { assertCardProvenance } from '../domain/cardRules.js';
import { captureProvenance, holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import type { ReissueCardRequest, ReissueCardResponse } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { createStamp, findCardRow, findCardWithStamps, updateCard } from '../data/repo.js';
import {
  assertDifferentCards,
  assertReissuable,
  assertReplacementUnissued,
  replacementStatus,
  requireCard,
} from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { getCardById } from './getCard.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { lockCards } from '../data/cardLocks.js';
import { lockCurrentActor, requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { reissueReceipt } from './cardReceipt.js';
import { assertCardWritePhase } from '../domain/cardPhase.js';

type CardWithStamps = NonNullable<Awaited<ReturnType<typeof findCardWithStamps>>>;

/**
 * Copy the journey. New idempotency keys, because these are new rows for the
 * same real-world events and the originals' keys are already taken.
 */
async function copyStamps(
  tx: PrismaTransactionClient,
  scope: EventScope,
  journey: { original: CardWithStamps; replacementId: string },
): Promise<void> {
  const { original, replacementId } = journey;
  for (const stamp of original.stampEvents) {
    await createStamp(tx, scope, {
      rehearsal: stamp.rehearsal,
      missionCardId: replacementId,
      stationId: stamp.stationId,
      recordedById: stamp.recordedById,
      recordedByMembershipId: stamp.recordedByMembershipId,
      recordedAt: stamp.recordedAt,
      source: stamp.source,
      idempotencyKey: `reissue:${replacementId}:${stamp.stationId}`,
    });
  }
}

async function moveJourney(tx: PrismaTransactionClient, scope: EventScope,
  input: { original: CardWithStamps; replacementId: string; now: Date }): Promise<void> {
  const { original, replacementId, now } = input;
  await updateCard(tx, scope, {
    id: replacementId,
    data: { status: replacementStatus(original.status), issuedAt: original.issuedAt ?? now,
      completedAt: original.completedAt, reissuedFromId: original.id },
  });
  await copyStamps(tx, scope, { original, replacementId });
  // LOST retains the continued journey rather than counting the original as spoiled (ADR-002 §3).
  await updateCard(tx, scope, { id: original.id, data: { status: 'LOST' } });
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
  { scope, audit, membershipId, volunteerId, clock = systemClock }: ActorContext & { clock?: Clock },
): Promise<ReissueCardResponse> {
  const originalCode = normaliseShortCode(shortCodeInput);
  const replacementCode = normaliseShortCode(request.replacementShortCode);
  assertDifferentCards(originalCode, replacementCode);
  const now = clock.now();

  const result = await prisma.$transaction(async (tx) => {
    assertCardWritePhase((await holdCaptureEvent(tx, scope)).status);
    const provenance = await captureProvenance(tx, scope);
    const identity = { scope, membershipId, personId: volunteerId };
    await lockCurrentActor(tx, identity);
    await lockReserved(tx, scope, request.idempotencyKey);
    await lockCards(tx, scope, [originalCode, replacementCode]);
    const original = requireCard(await findCardWithStamps(tx, scope, originalCode));
    await requireCurrentPermission(tx, { ...identity, action: 'Card.Reissue',
      resource: { type: 'MissionCard', id: original.id }, clock });
    assertCardProvenance(original, provenance);
    assertReissuable(original);
    const replacement = requireCard(
      await findCardRow(tx, scope, replacementCode),
      'No replacement card with that code',
    );
    assertCardProvenance(replacement, provenance);
    assertReplacementUnissued(replacement);

    await moveJourney(tx, scope, { original, replacementId: replacement.id, now });

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
    const receipt = reissueReceipt({ cardId: replacement.id, shortCode: replacementCode,
      originalShortCode: originalCode, voidedCardId: original.id,
      stampsCarriedOver: original.stampEvents.length });
    await settleReserved(tx, scope, { key: request.idempotencyKey, statusCode: 201, body: receipt });
    return { cardId: replacement.id, voidedCardId: original.id, stampsCarriedOver: original.stampEvents.length };
  });

  return { card: await getCardById(scope, result.cardId),
    voidedCardId: result.voidedCardId, stampsCarriedOver: result.stampsCarriedOver };
}
