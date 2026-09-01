import { z } from 'zod';

/**
 * Shapes used by more than one resource. Everything here is `.strict()` where
 * it is an object schema, so unknown keys are rejected rather than ignored
 * (BUILD_PLAN §8.3).
 */

/** A cuid primary key. Loose on the alphabet, strict on the shape. */
export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

/**
 * Client-generated UUIDv4 that makes every create endpoint replay-safe.
 * Written to the outbox before the first send attempt, so a retry after a
 * timeout can never double-count (BUILD_PLAN §7.4).
 */
export const IdempotencyKey = z.uuid();
export type IdempotencyKey = z.infer<typeof IdempotencyKey>;

/** ISO-8601 instant. Stored as `timestamptz`; always UTC on the wire. */
export const IsoDateTime = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Calendar date, `YYYY-MM-DD`, interpreted in Asia/Singapore for display. */
export const IsoDate = z.iso.date();
export type IsoDate = z.infer<typeof IsoDate>;

/**
 * Every capture request carries the instant the volunteer actually tapped.
 * The server still stamps its own `recordedAt` on receipt; both are stored,
 * because a phone that slept for ten minutes would otherwise skew the curve.
 */
export const CaptureEnvelope = z
  .object({
    idempotencyKey: IdempotencyKey,
    clientRecordedAt: IsoDateTime.optional(),
  })
  .strict();
export type CaptureEnvelope = z.infer<typeof CaptureEnvelope>;

/**
 * The three counts are never merged (PRODUCT_BRIEF §0.1). Any endpoint that
 * returns a number returns it alongside the unit it is measured in, so no
 * caller can add a footfall figure to a registration figure by accident.
 */
export const CountUnit = z.enum(['registrations', 'roomEntries', 'cards', 'redemptions']);
export type CountUnit = z.infer<typeof CountUnit>;

export const CountValue = z
  .object({
    value: z.number().int().nonnegative(),
    unit: CountUnit,
  })
  .strict();
export type CountValue = z.infer<typeof CountValue>;

/** Uniform error envelope. Never carries stack traces or SQL (BUILD_PLAN §7.1). */
export const ErrorBody = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        requestId: z.string(),
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();
export type ErrorBody = z.infer<typeof ErrorBody>;

export const PaginationQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: Id.optional(),
  })
  .strict();
export type PaginationQuery = z.infer<typeof PaginationQuery>;

/** Half-open time range `[from, to)`. Both bounds optional. */
export const TimeRangeQuery = z
  .object({
    from: IsoDateTime.optional(),
    to: IsoDateTime.optional(),
  })
  .strict();
export type TimeRangeQuery = z.infer<typeof TimeRangeQuery>;

/** Collection envelope: `{ data, meta }` for every list response. */
export function collection<T extends z.ZodType>(item: T) {
  return z
    .object({
      data: z.array(item),
      meta: z
        .object({
          count: z.number().int().nonnegative(),
          nextCursor: Id.nullable().default(null),
        })
        .strict(),
    })
    .strict();
}

/** A reason string required on every destructive or corrective action. */
export const ReasonText = z.string().trim().min(3).max(500);
export type ReasonText = z.infer<typeof ReasonText>;
