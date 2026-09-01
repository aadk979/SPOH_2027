import { z } from 'zod';
import { DataSource, VisitorCategory } from '../enums.js';
import { Id, IsoDateTime, ReasonText } from './common.js';

/**
 * Fallback windows and reconciliation (PRODUCT_BRIEF §11).
 *
 * The rule this whole file exists to serve: **never silently blend sources.**
 * A report that quietly mixes app data and paper estimates without saying so is
 * worse than one that says "this hour is approximate".
 *
 * Declaring a tier is a command decision, not a volunteer one. Individual
 * volunteers switching systems on their own is how the same visitor ends up
 * counted in three places.
 */

/** Tier 3 = Google fallback pack. Tier 4 = paper pack. */
export const FallbackTier = z.union([z.literal(3), z.literal(4)]);
export type FallbackTier = z.infer<typeof FallbackTier>;

export const DeclareFallbackRequest = z
  .object({
    tier: FallbackTier,
    reason: ReasonText,
    /** Null or omitted means event-wide. */
    stationId: Id.nullish(),
    /**
     * When degraded operation actually began, which is usually a few minutes
     * before anybody declared it. Defaults to now.
     */
    startedAt: IsoDateTime.optional(),
  })
  .strict();
export type DeclareFallbackRequest = z.infer<typeof DeclareFallbackRequest>;

export const CloseFallbackRequest = z
  .object({
    endedAt: IsoDateTime.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type CloseFallbackRequest = z.infer<typeof CloseFallbackRequest>;

export const FallbackWindowRecord = z
  .object({
    id: Id,
    tier: z.number().int(),
    startedAt: IsoDateTime,
    endedAt: IsoDateTime.nullable(),
    stationId: Id.nullable(),
    stationName: z.string().nullable(),
    declaredById: Id,
    declaredByName: z.string(),
    reason: z.string(),
    open: z.boolean(),
    durationMinutes: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type FallbackWindowRecord = z.infer<typeof FallbackWindowRecord>;

/**
 * Reconciliation imports (§11.4).
 *
 * Every imported row is source-tagged and keeps its original timestamp where
 * one was recorded, or a coarse time block where it was not. Recovery matters
 * as much as capture: a fallback with no import path is a fallback that loses
 * the data it was built to save.
 */
export const ImportSource = z.enum(['FALLBACK_SHEET', 'PAPER']);
export type ImportSource = z.infer<typeof ImportSource>;

export const RegistrationImportRow = z
  .object({
    category: VisitorCategory,
    stationCode: z.string().trim().min(1).max(64),
    /** Exact instant if the sheet captured one. */
    recordedAt: IsoDateTime.optional(),
    /** Otherwise the 30-minute block the tally sheet covers. */
    timeBlockStart: IsoDateTime.optional(),
    /** Row-level count, so a paper tally of 12 is one row rather than twelve. */
    count: z.number().int().min(1).max(500).default(1),
  })
  .strict()
  .refine((row) => row.recordedAt ?? row.timeBlockStart, {
    message: 'A row needs either recordedAt or timeBlockStart',
    path: ['recordedAt'],
  });
export type RegistrationImportRow = z.infer<typeof RegistrationImportRow>;

export const FootfallImportRow = z
  .object({
    stationCode: z.string().trim().min(1).max(64),
    quantity: z.number().int().min(1).max(5000),
    timeBlockStart: IsoDateTime,
  })
  .strict();
export type FootfallImportRow = z.infer<typeof FootfallImportRow>;

/**
 * Imports run as a dry run unless `commit` is set.
 *
 * Bringing an outage worth of counts into the real dataset is exactly the
 * operation you want to see the diff of before it happens, and the preview
 * costs one extra request.
 */
export const ImportRequest = <T extends z.ZodType>(row: T) =>
  z
    .object({
      source: ImportSource,
      rows: z.array(row).min(1).max(2000),
      commit: z.boolean().default(false),
      fileName: z.string().trim().max(200).optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .strict();

export const ImportRegistrationsRequest = ImportRequest(RegistrationImportRow);
export type ImportRegistrationsRequest = z.infer<typeof ImportRegistrationsRequest>;

export const ImportFootfallRequest = ImportRequest(FootfallImportRow);
export type ImportFootfallRequest = z.infer<typeof ImportFootfallRequest>;

export const ImportIssue = z
  .object({
    rowNumber: z.number().int().positive(),
    field: z.string(),
    message: z.string(),
  })
  .strict();
export type ImportIssue = z.infer<typeof ImportIssue>;

export const ImportResponse = z
  .object({
    committed: z.boolean(),
    source: DataSource,
    rowsRead: z.number().int().nonnegative(),
    recordsCreated: z.number().int().nonnegative(),
    /** Rows already present from a previous run of the same import. */
    recordsSkipped: z.number().int().nonnegative(),
    issues: z.array(ImportIssue),
    importBatchId: Id.nullable(),
  })
  .strict();
export type ImportResponse = z.infer<typeof ImportResponse>;
