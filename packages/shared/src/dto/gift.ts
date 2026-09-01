import { z } from 'zod';
import { DataSource } from '../enums.js';
import { CaptureEnvelope, Id, IsoDateTime, ReasonText, TimeRangeQuery } from './common.js';
import { CardShortCode } from './missionCard.js';

/**
 * Gift redemption and inventory (PRODUCT_BRIEF §5).
 *
 * Stock is derived, never stored as a mutable counter: `initialStock` plus the
 * sum of adjustments, minus unvoided redemptions. A counter column would drift
 * the first time a redemption was voided, and the number people trust at the
 * Mission Complete desk has to be the number the redemption log implies.
 */

export const GiftTypeRecord = z
  .object({
    id: Id,
    name: z.string(),
    initialStock: z.number().int(),
    lowStockThreshold: z.number().int(),
    active: z.boolean(),
    /** Derived: initialStock + adjustments − redemptions. */
    remaining: z.number().int(),
    redeemed: z.number().int().nonnegative(),
    adjustment: z.number().int(),
    lowStock: z.boolean(),
    outOfStock: z.boolean(),
  })
  .strict();
export type GiftTypeRecord = z.infer<typeof GiftTypeRecord>;

export const GiftListResponse = z
  .object({
    data: z.array(GiftTypeRecord),
    meta: z.object({ count: z.number().int().nonnegative() }).strict(),
  })
  .strict();
export type GiftListResponse = z.infer<typeof GiftListResponse>;

export const RedeemGiftRequest = CaptureEnvelope.extend({
  giftTypeId: Id,
  stationId: Id,
  /**
   * Optional. The physical stamped card is what authorises the gift; the scan
   * is a cross-check. A card that will not scan must never stop a visitor who
   * has walked the whole journey from receiving their keepsake.
   */
  cardShortCode: CardShortCode.optional(),
  /** Acknowledges a duplicate-redemption or incomplete-card warning. */
  acknowledgeWarning: z.boolean().default(false),
}).strict();
export type RedeemGiftRequest = z.infer<typeof RedeemGiftRequest>;

export const GiftRedemptionRecord = z
  .object({
    id: Id,
    giftTypeId: Id,
    giftTypeName: z.string(),
    missionCardId: Id.nullable(),
    stationId: Id,
    source: DataSource,
    recordedAt: IsoDateTime,
    voided: z.boolean(),
  })
  .strict();
export type GiftRedemptionRecord = z.infer<typeof GiftRedemptionRecord>;

export const RedeemGiftResponse = z
  .object({
    redemption: GiftRedemptionRecord,
    giftType: GiftTypeRecord,
    /** Populated when a card was presented — its stamp status, for the desk. */
    cardComplete: z.boolean().nullable(),
    warning: z.string().nullable(),
  })
  .strict();
export type RedeemGiftResponse = z.infer<typeof RedeemGiftResponse>;

/** IC-level stock correction: a delivery arrived, or a box was miscounted. */
export const AdjustGiftStockRequest = z
  .object({
    delta: z
      .number()
      .int()
      .refine((value) => value !== 0, 'A zero adjustment records nothing'),
    reason: ReasonText,
  })
  .strict();
export type AdjustGiftStockRequest = z.infer<typeof AdjustGiftStockRequest>;

export const GiftSummaryQuery = TimeRangeQuery.extend({
  eventDayId: Id.optional(),
  stationId: Id.optional(),
}).strict();
export type GiftSummaryQuery = z.infer<typeof GiftSummaryQuery>;

export const GiftSummaryRow = z
  .object({
    giftTypeId: Id,
    giftTypeName: z.string(),
    redeemed: z.number().int().nonnegative(),
    remaining: z.number().int(),
  })
  .strict();
export type GiftSummaryRow = z.infer<typeof GiftSummaryRow>;

export const GiftSummaryResponse = z
  .object({
    unit: z.literal('redemptions'),
    total: z.number().int().nonnegative(),
    byGiftType: z.array(GiftSummaryRow),
    containsFallbackData: z.boolean(),
  })
  .strict();
export type GiftSummaryResponse = z.infer<typeof GiftSummaryResponse>;
