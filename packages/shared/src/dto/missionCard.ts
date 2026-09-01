import { z } from 'zod';
import { CardStatus, DataSource } from '../enums.js';
import { CaptureEnvelope, Id, IsoDateTime, ReasonText } from './common.js';

/**
 * COUNT 3 of the three counts (PRODUCT_BRIEF §0.1, §4).
 *
 * A card is a journey, not a person. One card can be a family of four, which is
 * exactly why the card count must never be presented as a headcount.
 *
 * The physical card is not replaced. The stamps are the point — they are the
 * keepsake, and they work when nothing else does. The system MIRRORS the card;
 * the physical stamp remains authoritative for gift redemption, and a scan is a
 * cross-check rather than a gate.
 */

/**
 * Six characters from an ambiguity-free alphabet. Printed on the card, and the
 * fallback when a QR is damaged — so a volunteer has to be able to read it off
 * a scuffed card and type it correctly on the first try.
 */
export const CardShortCode = z
  .string()
  .trim()
  .toUpperCase()
  .length(6)
  .regex(/^[0-9A-HJ-NP-Z]{6}$/, 'Not a valid card code');
export type CardShortCode = z.infer<typeof CardShortCode>;

export const CardStampRecord = z
  .object({
    id: Id,
    stationId: Id,
    stationName: z.string(),
    recordedAt: IsoDateTime,
    recordedByName: z.string(),
    source: DataSource,
  })
  .strict();
export type CardStampRecord = z.infer<typeof CardStampRecord>;

export const MissionCardRecord = z
  .object({
    id: Id,
    shortCode: z.string(),
    status: CardStatus,
    issuedAt: IsoDateTime.nullable(),
    completedAt: IsoDateTime.nullable(),
    voidedAt: IsoDateTime.nullable(),
    reissuedFromId: Id.nullable(),
    batchLabel: z.string().nullable(),
    stamps: z.array(CardStampRecord),
    /** Stations that stamp, which this card has not yet visited. */
    remainingStationIds: z.array(Id),
    /** Has a gift already been redeemed against this card. */
    redeemed: z.boolean(),
  })
  .strict();
export type MissionCardRecord = z.infer<typeof MissionCardRecord>;

export const IssueCardRequest = CaptureEnvelope.extend({
  /** Optional: links the card to a group registered a moment earlier. */
  groupId: Id.optional(),
}).strict();
export type IssueCardRequest = z.infer<typeof IssueCardRequest>;

export const StampCardRequest = CaptureEnvelope.extend({
  stationId: Id,
  /**
   * Acknowledges a duplicate-stamp warning and proceeds. A re-scan after a
   * correction is legitimate, so the second scan warns rather than blocking
   * (PRODUCT_BRIEF §12) — but the volunteer has to mean it.
   */
  acknowledgeDuplicate: z.boolean().default(false),
}).strict();
export type StampCardRequest = z.infer<typeof StampCardRequest>;

export const StampCardResponse = z
  .object({
    card: MissionCardRecord,
    /**
     * False when this station had already stamped the card. No second row is
     * written — the unique constraint on (card, station) means a journey is a
     * set of stations visited, not a tally of scans.
     */
    stampAdded: z.boolean(),
    /** Set when the card became COMPLETED as a result of this stamp. */
    justCompleted: z.boolean(),
    warning: z.string().nullable(),
  })
  .strict();
export type StampCardResponse = z.infer<typeof StampCardResponse>;

export const VoidCardRequest = z.object({ reason: ReasonText }).strict();
export type VoidCardRequest = z.infer<typeof VoidCardRequest>;

/**
 * Reissue against a lost card (PRODUCT_BRIEF §4.3). IC-level, because it moves
 * a journey from one physical object to another and the old card must be voided
 * so the same journey cannot be redeemed twice.
 */
export const ReissueCardRequest = z
  .object({
    reason: ReasonText,
    /** The replacement card's printed code, taken from a fresh card. */
    replacementShortCode: CardShortCode,
  })
  .strict();
export type ReissueCardRequest = z.infer<typeof ReissueCardRequest>;

export const ReissueCardResponse = z
  .object({
    card: MissionCardRecord,
    voidedCardId: Id,
    stampsCarriedOver: z.number().int().nonnegative(),
  })
  .strict();
export type ReissueCardResponse = z.infer<typeof ReissueCardResponse>;

/**
 * Batch generation (PRODUCT_BRIEF §4.4).
 *
 * Card IDs are pre-generated and printed at production time, never generated at
 * the booth — a card has to survive being put in a pocket on 6 January and
 * brought back on 8 January, across devices and across days.
 *
 * This is the most time-sensitive dependency in the project: the QR and short
 * code must be in the card design before it goes to print.
 */
export const GenerateCardBatchRequest = z
  .object({
    count: z.number().int().min(1).max(5000),
    batchLabel: z.string().trim().min(1).max(64),
  })
  .strict();
export type GenerateCardBatchRequest = z.infer<typeof GenerateCardBatchRequest>;

export const GenerateCardBatchResponse = z
  .object({
    batchLabel: z.string(),
    created: z.number().int().nonnegative(),
    /** `shortCode,qrPayload` rows, ready to hand to the printer. */
    csv: z.string(),
  })
  .strict();
export type GenerateCardBatchResponse = z.infer<typeof GenerateCardBatchResponse>;

/**
 * The funnel — the single richest dataset the event has never had.
 *
 * Of the cards issued: how many reached the Welcome Lounge, each course
 * station, and Mission Complete. Every stage is a card count, and the response
 * says so, because a card is a journey and not a headcount.
 */
export const FunnelStage = z
  .object({
    key: z.string(),
    label: z.string(),
    value: z.number().int().nonnegative(),
    /** Share of issued cards that reached this stage, 0–1. */
    rateOfIssued: z.number().min(0).max(1),
  })
  .strict();
export type FunnelStage = z.infer<typeof FunnelStage>;

export const CardFunnelResponse = z
  .object({
    unit: z.literal('cards'),
    issued: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    redeemed: z.number().int().nonnegative(),
    voided: z.number().int().nonnegative(),
    /** Per-station reach, in journey order. */
    stages: z.array(FunnelStage),
    containsFallbackData: z.boolean(),
  })
  .strict();
export type CardFunnelResponse = z.infer<typeof CardFunnelResponse>;

export const CardLookupParams = z.object({ shortCode: CardShortCode }).strict();
export type CardLookupParams = z.infer<typeof CardLookupParams>;
