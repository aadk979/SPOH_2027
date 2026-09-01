import { z } from 'zod';
import { DataSource } from '../enums.js';
import { CaptureEnvelope, Id, IsoDateTime, ReasonText, TimeRangeQuery } from './common.js';

/**
 * COUNT 2 of the three counts (PRODUCT_BRIEF §0.1).
 *
 * One row = one body entering a room. Never a unique visitor, never joined to
 * `Registration`. A visitor who walks into four rooms is four rows and that is
 * the correct answer to the question footfall asks.
 */

export const CreateFootfallTickRequest = CaptureEnvelope.extend({
  stationId: Id,
}).strict();
export type CreateFootfallTickRequest = z.infer<typeof CreateFootfallTickRequest>;

/**
 * IC-only bulk entry: a physical clicker total keyed in at end of shift, or a
 * 30-minute block transcribed off a fallback sheet. Always source-tagged so it
 * stays distinguishable from app taps in every report (PRODUCT_BRIEF §3.2).
 */
export const CreateFootfallBulkRequest = CaptureEnvelope.extend({
  stationId: Id,
  quantity: z.number().int().min(1).max(5000),
  timeBlockStart: IsoDateTime,
  source: z.enum(['FALLBACK_SHEET', 'PAPER', 'MANUAL_ADJUSTMENT']),
  reason: ReasonText,
}).strict();
export type CreateFootfallBulkRequest = z.infer<typeof CreateFootfallBulkRequest>;

export const FootfallTickRecord = z
  .object({
    id: Id,
    stationId: Id,
    quantity: z.number().int().positive(),
    source: DataSource,
    recordedAt: IsoDateTime,
    clientRecordedAt: IsoDateTime.nullable(),
    timeBlockStart: IsoDateTime.nullable(),
    voided: z.boolean(),
  })
  .strict();
export type FootfallTickRecord = z.infer<typeof FootfallTickRecord>;

export const CreateFootfallTickResponse = z
  .object({
    tick: FootfallTickRecord,
    /** This device's contribution, and the room total across all counters. */
    sessionTotal: z.number().int().nonnegative(),
    stationTotal: z.number().int().nonnegative(),
  })
  .strict();
export type CreateFootfallTickResponse = z.infer<typeof CreateFootfallTickResponse>;

export const VoidFootfallTickRequest = z.object({ reason: ReasonText }).strict();
export type VoidFootfallTickRequest = z.infer<typeof VoidFootfallTickRequest>;

export const FootfallBucketSize = z.enum(['15m', '30m', '1h']);
export type FootfallBucketSize = z.infer<typeof FootfallBucketSize>;

export const FootfallSummaryQuery = TimeRangeQuery.extend({
  stationId: Id.optional(),
  eventDayId: Id.optional(),
  bucket: FootfallBucketSize.default('30m'),
}).strict();
export type FootfallSummaryQuery = z.infer<typeof FootfallSummaryQuery>;

export const FootfallSummaryBucket = z
  .object({
    bucketStart: IsoDateTime,
    value: z.number().int().nonnegative(),
  })
  .strict();
export type FootfallSummaryBucket = z.infer<typeof FootfallSummaryBucket>;

export const FootfallStationSummary = z
  .object({
    stationId: Id,
    stationName: z.string(),
    total: z.number().int().nonnegative(),
    buckets: z.array(FootfallSummaryBucket),
  })
  .strict();
export type FootfallStationSummary = z.infer<typeof FootfallStationSummary>;

export const FootfallSummaryResponse = z
  .object({
    unit: z.literal('roomEntries'),
    bucket: FootfallBucketSize,
    total: z.number().int().nonnegative(),
    stations: z.array(FootfallStationSummary),
    containsFallbackData: z.boolean(),
  })
  .strict();
export type FootfallSummaryResponse = z.infer<typeof FootfallSummaryResponse>;

/**
 * Live per-station counts plus the last time each station recorded anything.
 * `lastActivityAt` is what makes the data-health panel possible: a station that
 * has quietly stopped counting is invisible in a total but obvious here.
 */
export const FootfallLiveStation = z
  .object({
    stationId: Id,
    stationName: z.string(),
    todayTotal: z.number().int().nonnegative(),
    lastActivityAt: IsoDateTime.nullable(),
    minutesSinceLastActivity: z.number().int().nonnegative().nullable(),
    activeCounterCount: z.number().int().nonnegative(),
    silent: z.boolean(),
  })
  .strict();
export type FootfallLiveStation = z.infer<typeof FootfallLiveStation>;

export const FootfallLiveResponse = z
  .object({
    unit: z.literal('roomEntries'),
    asOf: IsoDateTime,
    stations: z.array(FootfallLiveStation),
  })
  .strict();
export type FootfallLiveResponse = z.infer<typeof FootfallLiveResponse>;
