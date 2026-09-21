import {
  ERROR_CODES,
  type AdjustGiftStockRequest,
  type GiftSummaryQuery,
  type GiftSummaryResponse,
  type GiftTypeRecord,
  type RedeemGiftRequest,
  type RedeemGiftResponse,
} from '@spoh/shared';
import { auditStationScopeBypass, writeAudit, type AuditContext } from '../../lib/audit.js';
import type { CaptureActor } from '../../lib/captureActor.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { normaliseShortCode } from '../../lib/shortCode.js';
import { rangeOverlapsFallbackWindow } from '../fallback/repo.js';
import { requireActiveStation } from '../station/service.js';
import { dispatch } from '../notification/service.js';
import {
  createAdjustment,
  createRedemption,
  existingRedemptionForCard,
  findGiftType,
  giftTotals,
  listGiftTypes,
  summariseRedemptions,
  toGiftTypeRecord,
  totalsForGiftType,
} from './repo.js';

/**
 * Gift redemption and inventory (PRODUCT_BRIEF §5).
 *
 * The physical stamped card is what authorises a gift. The scan is a
 * cross-check, never a gate — a card that will not scan must never stop a
 * visitor who has walked the whole journey from receiving their keepsake. So
 * every soft failure here is a warning the volunteer can acknowledge, and only
 * genuinely running out of stock is a hard stop.
 */

export async function listGifts(): Promise<GiftTypeRecord[]> {
  const [gifts, totals] = await Promise.all([listGiftTypes(), giftTotals()]);

  return gifts.map((gift) =>
    toGiftTypeRecord(gift, totals.get(gift.id) ?? { redeemed: 0, adjustment: 0 }),
  );
}

export async function redeemGift(
  request: RedeemGiftRequest,
  actor: CaptureActor,
  audit: AuditContext,
): Promise<RedeemGiftResponse> {
  const station = await requireActiveStation(request.stationId);
  const recordedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const giftType = await findGiftType(request.giftTypeId, tx);
    if (!giftType) throw new NotFoundError('Gift type');

    const before = await totalsForGiftType(tx, giftType.id);
    const remaining = giftType.initialStock + before.adjustment - before.redeemed;

    /**
     * The one hard stop. Out of stock renders a clear domain error rather than
     * a silent failure or a 500, so the desk sees "we have run out" and not
     * "something went wrong" (§5).
     */
    if (remaining <= 0) {
      throw new AppError(
        409,
        ERROR_CODES.GIFT_OUT_OF_STOCK,
        `${giftType.name} is out of stock. Tell your IC and offer an alternative.`,
      );
    }

    let missionCardId: string | null = null;
    let cardComplete: boolean | null = null;
    let warning: string | null = null;

    if (request.cardShortCode) {
      const card = await tx.missionCard.findUnique({
        where: { shortCode: normaliseShortCode(request.cardShortCode) },
        include: { stampEvents: { select: { stationId: true } } },
      });

      if (!card) {
        // Not an error. The physical card is authoritative; a code that does
        // not resolve loses the journey link and nothing else.
        warning = 'That card code was not found. The gift was still recorded.';
      } else if (card.status === 'VOIDED') {
        warning = 'That card has been voided. Check with your IC before handing over a gift.';
        missionCardId = card.id;
      } else {
        missionCardId = card.id;
        cardComplete = card.status === 'COMPLETED';

        const duplicate = await existingRedemptionForCard(tx, card.id);

        if (duplicate && !request.acknowledgeWarning) {
          throw new AppError(
            409,
            ERROR_CODES.GIFT_ALREADY_REDEEMED,
            'A gift has already been redeemed against this card. Check the physical card, then confirm to proceed.',
          );
        }

        if (duplicate)
          warning = 'Second gift redeemed against this card, confirmed by the volunteer.';
        else if (!cardComplete) warning = 'This card is not yet complete. Verify the stamps.';
      }
    }

    const redemption = await createRedemption(tx, {
      giftTypeId: giftType.id,
      missionCardId,
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
        missionCardId,
        stationId: station.id,
        remainingAfter: remaining - 1,
        warning,
      },
    });

    const after = await totalsForGiftType(tx, giftType.id);
    const record = toGiftTypeRecord(giftType, after);

    return { redemption, record, cardComplete, warning };
  });

  // Low stock alerts are an IC duty in the deck; automating it beats relying on
  // someone noticing (§5).
  if (result.record.lowStock) {
    notifyLowStock(result.record);
  }

  return {
    redemption: {
      id: result.redemption.id,
      giftTypeId: result.redemption.giftTypeId,
      giftTypeName: result.record.name,
      missionCardId: result.redemption.missionCardId,
      stationId: result.redemption.stationId,
      source: result.redemption.source,
      recordedAt: result.redemption.recordedAt.toISOString(),
      voided: result.redemption.voided,
    },
    giftType: result.record,
    cardComplete: result.cardComplete,
    warning: result.warning,
  };
}

export async function adjustStock(
  giftTypeId: string,
  request: AdjustGiftStockRequest,
  actorId: string,
  audit: AuditContext,
): Promise<GiftTypeRecord> {
  return prisma.$transaction(async (tx) => {
    const giftType = await findGiftType(giftTypeId, tx);
    if (!giftType) throw new NotFoundError('Gift type');

    const before = await totalsForGiftType(tx, giftTypeId);

    await createAdjustment(tx, {
      giftTypeId,
      delta: request.delta,
      reason: request.reason,
      createdById: actorId,
    });

    await writeAudit(tx, {
      ...audit,
      action: 'gift.adjust',
      entityType: 'GiftType',
      entityId: giftTypeId,
      before: { adjustment: before.adjustment },
      after: { delta: request.delta, reason: request.reason },
    });

    return toGiftTypeRecord(giftType, await totalsForGiftType(tx, giftTypeId));
  });
}

export async function summariseGifts(query: GiftSummaryQuery): Promise<GiftSummaryResponse> {
  const filter = {
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
  };

  const [rows, gifts, containsFallbackData] = await Promise.all([
    summariseRedemptions(filter),
    listGifts(),
    rangeOverlapsFallbackWindow(filter),
  ]);

  const counts = new Map(rows.map((row) => [row.giftTypeId, row.count]));

  return {
    unit: 'redemptions',
    total: rows.reduce((sum, row) => sum + row.count, 0),
    byGiftType: gifts.map((gift) => ({
      giftTypeId: gift.id,
      giftTypeName: gift.name,
      redeemed: counts.get(gift.id) ?? 0,
      remaining: gift.remaining,
    })),
    containsFallbackData,
  };
}

/**
 * Tell the Deputy Coordinator and the Chief that stock is running out.
 *
 * The deck makes this an IC duty (§5); what actually happens when it is left to
 * someone noticing is that the first anyone hears of it is a visitor being
 * turned away at the desk.
 */
function notifyLowStock(gift: GiftTypeRecord): void {
  void dispatch({
    kind: 'gift.lowStock',
    priority: 'OPERATIONAL',
    title: `${gift.name} is running low`,
    body: `${gift.remaining} left. Restock, or brief the desk on an alternative.`,
    url: '/chief',
    tag: `gift-low:${gift.id}`,
    audience: { everyone: false, minimumRole: 'DEPUTY_COORDINATOR', volunteerIds: [] },
  });
}
