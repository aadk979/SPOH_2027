import { z } from 'zod';
import { LostPersonStatus } from '../enums.js';
import { Id, IdempotencyKey, IsoDateTime } from './common.js';

/**
 * Lost person (PRODUCT_BRIEF §7.3) — the one place the system holds a
 * description of a human being, and it is transient by design.
 *
 * Two constraints ride on this DTO:
 *  1. The record is purged 24h after resolution: the descriptive fields are
 *     nulled and an anonymised `LostPersonSummary` is what survives (§5.9).
 *     Reports read the summary only.
 *  2. Calling still beats tapping. This flow coordinates a search; the standing
 *     instruction for a genuine emergency remains phone and voice.
 */

export const RaiseLostPersonRequest = z
  .object({
    idempotencyKey: IdempotencyKey,
    approxAge: z.string().trim().max(40).optional(),
    descriptionText: z.string().trim().min(3).max(500),
    clothingText: z.string().trim().max(500).optional(),
    lastSeenStationId: Id.nullish(),
    lastSeenAt: IsoDateTime.optional(),
  })
  .strict();
export type RaiseLostPersonRequest = z.infer<typeof RaiseLostPersonRequest>;

export const LostPersonAlertRecord = z
  .object({
    id: Id,
    status: LostPersonStatus,
    approxAge: z.string().nullable(),
    descriptionText: z.string().nullable(),
    clothingText: z.string().nullable(),
    lastSeenStationId: Id.nullable(),
    lastSeenStationName: z.string().nullable(),
    lastSeenAt: IsoDateTime.nullable(),
    raisedById: Id,
    raisedByName: z.string(),
    raisedByPhone: z.string().nullable(),
    raisedAt: IsoDateTime,
    resolvedAt: IsoDateTime.nullable(),
    /** How much of the floor has seen this alert — the Safety IC's key signal. */
    ackCount: z.number().int().nonnegative(),
    ackedByMe: z.boolean(),
  })
  .strict();
export type LostPersonAlertRecord = z.infer<typeof LostPersonAlertRecord>;

export const ActiveLostPersonResponse = z
  .object({
    asOf: IsoDateTime,
    alerts: z.array(LostPersonAlertRecord),
  })
  .strict();
export type ActiveLostPersonResponse = z.infer<typeof ActiveLostPersonResponse>;

export const ResolveLostPersonRequest = z
  .object({
    outcome: z.enum(['RESOLVED_FOUND', 'RESOLVED_OTHER']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type ResolveLostPersonRequest = z.infer<typeof ResolveLostPersonRequest>;

/** What survives the purge. The only shape any report is allowed to read. */
export const LostPersonSummaryRecord = z
  .object({
    id: Id,
    raisedAt: IsoDateTime,
    resolvedAt: IsoDateTime,
    resolutionMinutes: z.number().int().nonnegative(),
    outcome: LostPersonStatus,
    ackCount: z.number().int().nonnegative(),
  })
  .strict();
export type LostPersonSummaryRecord = z.infer<typeof LostPersonSummaryRecord>;
