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
import { checkPresentedCard, stockFlag, type CardCheck } from '../domain/redemptionRules.js';
import type { RedemptionFlag } from '@spoh/shared';
import { notifyLowStock } from './notifyLowStock.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const NO_CARD: CardCheck = {
  missionCardId: null,
  cardComplete: null,
  warning: null,
  secondGift: false,
};

/** Check the card the visitor presented, if they gave a code at all. */
async function checkCard(
  tx: PrismaTransactionClient,
  scope: EventScope,
  request: RedeemGiftRequest,
) {
  if (!request.cardShortCode) return NO_CARD;
  const card = await findCardForRedemption(tx, scope, request.cardShortCode);
  const usable = card && card.status !== 'VOIDED' && card.status !== 'LOST';
  return checkPresentedCard({
    card,
    // One gift per journey: a gift against a card this one replaced counts (F03-003).
    alreadyRedeemed: usable
      ? (await existingRedemptionForCards(
          tx,
          scope,
          await findJourneyCardIds(tx, scope, card.id),
        )) !== null
      : false,
    // A queued redemption was handed over already; a second gift is flagged, not refused.
    acknowledged: (request.acknowledgeWarning ?? false) || request.queued,
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

/** Why a queued redemption needs the IC, and what the desk is told about it. */
function flagFor(
  request: RedeemGiftRequest,
  gift: { name: string; overStock: boolean },
  check: CardCheck,
): { flag: RedemptionFlag | null; warning: string | null } {
  if (gift.overStock) {
    return {
      flag: 'OVER_STOCK',
      warning: `${gift.name} was out of stock; this gift is recorded and flagged for your IC.`,
    };
  }
  return {
    flag: request.queued && check.secondGift ? 'SECOND_GIFT' : null,
    warning: check.warning,
  };
}

interface RecordInput {
  request: RedeemGiftRequest;
  stationId: string;
  context: CaptureContext;
  recordedAt: Date;
}

/** Lock the gift type, check stock and card, write the redemption and its audit row. */
async function recordRedemption(tx: PrismaTransactionClient, input: RecordInput) {
  const { request, stationId, context, recordedAt } = input;
  const { scope } = context;
  // Gift type first, then the card (in checkCard): one order, so no deadlock.
  await lockGiftType(tx, scope, request.giftTypeId);
  const giftType = await findGiftType(scope, request.giftTypeId, tx);
  if (!giftType) throw new NotFoundError('Gift type');
  const before = await totalsForGiftType(tx, scope, giftType.id);
  const remaining = giftType.initialStock + before.adjustment - before.redeemed;
  // Stock before the card, as before: online, running out is the answer the desk gets first.
  const overStock = stockFlag(giftType, remaining, request.queued) !== null;
  const card = await checkCard(tx, scope, request);
  const { flag, warning } = flagFor(request, { name: giftType.name, overStock }, card);
  const check = { ...card, warning };

  const redemption = await createRedemption(tx, scope, {
    giftTypeId: giftType.id,
    missionCardId: check.missionCardId,
    stationId,
    recordedById: context.actor.volunteerId,
    recordedByMembershipId: context.actor.membershipId,
    recordedAt,
    idempotencyKey: request.idempotencyKey,
    source: 'APP',
    flag,
  });

  await auditStationScopeBypass(tx, context.actor.stationScopeBypass, context.audit);
  await writeAudit(tx, {
    ...context.audit,
    action: 'gift.redeem',
    entityType: 'GiftRedemption',
    entityId: redemption.id,
    after: {
      giftTypeId: giftType.id,
      missionCardId: check.missionCardId,
      stationId,
      remainingAfter: remaining - 1,
      warning,
      flag,
    },
  });

  const record = toGiftTypeRecord(giftType, await totalsForGiftType(tx, scope, giftType.id));
  return { redemption, record, check };
}

/** Hand over a gift at the Mission Complete desk and record it. */
export async function redeemGift(
  request: RedeemGiftRequest,
  context: CaptureContext,
): Promise<RedeemGiftResponse> {
  const station = await requireActiveStation(context.scope, request.stationId);
  const recordedAt = (context.clock ?? systemClock).now();

  const result = await prisma.$transaction((tx) =>
    recordRedemption(tx, { request, stationId: station.id, context, recordedAt }),
  );

  // Low stock alerts are an IC duty in the deck; automating it beats relying on
  // someone noticing (§5).
  if (result.record.lowStock) notifyLowStock(context.scope, result.record);
  return toResponse(result);
}
