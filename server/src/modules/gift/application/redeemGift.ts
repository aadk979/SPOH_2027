import type { RedeemGiftRequest, RedeemGiftResponse } from '@spoh/shared';
import { auditStationScopeBypass, writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { systemClock } from '../../../platform/time/index.js';
import { findCardForRedemption, findJourneyCardIds } from '../../missionCard/index.js';
import { requireActiveStation } from '../../station/index.js';
import { toGiftTypeRecord } from '../data/mappers.js';
import {
  createRedemption,
  existingRedemptionForCards,
  findGiftType,
  lockGiftType,
  totalsForGiftType,
} from '../data/repo.js';
import { assertInStock, checkPresentedCard, type CardCheck } from '../domain/redemptionRules.js';
import { notifyLowStock } from './notifyLowStock.js';

const NO_CARD: CardCheck = { missionCardId: null, cardComplete: null, warning: null };

/** Check the card the visitor presented, if they gave a code at all. */
async function checkCard(tx: PrismaTransactionClient, request: RedeemGiftRequest) {
  if (!request.cardShortCode) return NO_CARD;
  const card = await findCardForRedemption(tx, request.cardShortCode);
  const usable = card && card.status !== 'VOIDED' && card.status !== 'LOST';
  return checkPresentedCard({
    card,
    // One gift per journey: a gift against a card this one replaced counts (F03-003).
    alreadyRedeemed: usable
      ? (await existingRedemptionForCards(tx, await findJourneyCardIds(tx, card.id))) !== null
      : false,
    acknowledged: request.acknowledgeWarning ?? false,
  });
}

type Redemption = Awaited<ReturnType<typeof createRedemption>>;

function toResponse(result: {
  redemption: Redemption;
  record: RedeemGiftResponse['giftType'];
  check: CardCheck;
}): RedeemGiftResponse {
  const { redemption, record, check } = result;
  return {
    redemption: {
      id: redemption.id,
      giftTypeId: redemption.giftTypeId,
      giftTypeName: record.name,
      missionCardId: redemption.missionCardId,
      stationId: redemption.stationId,
      source: redemption.source,
      recordedAt: redemption.recordedAt.toISOString(),
      voided: redemption.voided,
    },
    giftType: record,
    cardComplete: check.cardComplete,
    warning: check.warning,
  };
}

/** Hand over a gift at the Mission Complete desk and record it. */
export async function redeemGift(
  request: RedeemGiftRequest,
  { actor, audit, clock = systemClock }: CaptureContext,
): Promise<RedeemGiftResponse> {
  const station = await requireActiveStation(request.stationId);
  const recordedAt = clock.now();

  const result = await prisma.$transaction(async (tx) => {
    // Gift type first, then the card (in checkCard): one order, so no deadlock.
    await lockGiftType(tx, request.giftTypeId);
    const giftType = await findGiftType(request.giftTypeId, tx);
    if (!giftType) throw new NotFoundError('Gift type');
    const before = await totalsForGiftType(tx, giftType.id);
    const remaining = giftType.initialStock + before.adjustment - before.redeemed;
    assertInStock(giftType, remaining);

    const check = await checkCard(tx, request);
    const redemption = await createRedemption(tx, {
      giftTypeId: giftType.id,
      missionCardId: check.missionCardId,
      stationId: station.id,
      recordedById: actor.volunteerId,
      recordedAt,
      idempotencyKey: request.idempotencyKey,
      source: 'APP',
    });

    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);
    await writeAudit(tx, {
      ...audit,
      action: 'gift.redeem',
      entityType: 'GiftRedemption',
      entityId: redemption.id,
      after: {
        giftTypeId: giftType.id,
        missionCardId: check.missionCardId,
        stationId: station.id,
        remainingAfter: remaining - 1,
        warning: check.warning,
      },
    });

    const record = toGiftTypeRecord(giftType, await totalsForGiftType(tx, giftType.id));
    return { redemption, record, check };
  });

  // Low stock alerts are an IC duty in the deck; automating it beats relying on
  // someone noticing (§5).
  if (result.record.lowStock) notifyLowStock(result.record);
  return toResponse(result);
}
