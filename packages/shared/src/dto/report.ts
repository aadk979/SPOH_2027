import { z } from 'zod';
import { IncidentSeverity, IncidentStatus, IncidentType, LostPersonStatus } from '../enums.js';
import { Id, IsoDate, IsoDateTime, TimeRangeQuery } from './common.js';
import { FallbackWindowRecord } from './fallback.js';

/**
 * Post-event reporting (PRODUCT_BRIEF §10).
 *
 * Everything the deck asks each IC to consolidate, generated rather than
 * assembled. Two rules run through the whole shape:
 *
 *  1. The three counts stay separate, each with its unit, all the way into the
 *     export. There is no "visitors" figure anywhere in a report.
 *
 *  2. Any period overlapping a declared fallback window is flagged, and the
 *     windows themselves are listed. A report that quietly mixes app data and
 *     paper estimates is worse than one that says which hour is approximate.
 */

export const ReportQuery = TimeRangeQuery.extend({
  eventDayId: Id.optional(),
}).strict();
export type ReportQuery = z.infer<typeof ReportQuery>;

export const RegistrationReport = z
  .object({
    unit: z.literal('registrations'),
    total: z.number().int().nonnegative(),
    byCategory: z.array(
      z.object({ key: z.string(), value: z.number().int().nonnegative() }).strict(),
    ),
    byDay: z.array(z.object({ date: IsoDate, value: z.number().int().nonnegative() }).strict()),
    byHour: z.array(
      z
        .object({
          /** The true UTC instant the bucket starts at. Unambiguous, for machines. */
          hour: IsoDateTime,
          /**
           * The same moment in Singapore time, `YYYY-MM-DD HH:00`.
           *
           * The bucket boundaries were always right — Singapore is a whole
           * number of hours from UTC — but the label was not, and a reader
           * looking for the 11am rush had to shift every row by eight in their
           * head. Both are returned so neither audience has to convert.
           */
          localHour: z.string(),
          value: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    /** Excluded from every total above, reported so the corrections are visible. */
    voided: z.number().int().nonnegative(),
  })
  .strict();
export type RegistrationReport = z.infer<typeof RegistrationReport>;

export const FootfallReport = z
  .object({
    unit: z.literal('roomEntries'),
    total: z.number().int().nonnegative(),
    byStation: z.array(
      z
        .object({
          stationId: Id,
          stationName: z.string(),
          total: z.number().int().nonnegative(),
          /** The busiest 30-minute block, which is the peak-period answer. */
          peakBlockStart: IsoDateTime.nullable(),
          peakBlockValue: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    curve: z.array(
      z
        .object({
          bucketStart: IsoDateTime,
          stationId: Id,
          value: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    /** How much of the total came from somewhere other than an app tap. */
    bySource: z.array(
      z.object({ source: z.string(), value: z.number().int().nonnegative() }).strict(),
    ),
  })
  .strict();
export type FootfallReport = z.infer<typeof FootfallReport>;

export const CardReport = z
  .object({
    unit: z.literal('cards'),
    issued: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    voided: z.number().int().nonnegative(),
    completionRate: z.number().min(0).max(1),
    /**
     * Split by day, which matters because visitors keep their card and return.
     * A card issued on 6 Jan and completed on 8 Jan is one journey across two
     * days, and a naive per-day completion rate would misread it (§10).
     */
    issuedByDay: z.array(
      z.object({ date: IsoDate, value: z.number().int().nonnegative() }).strict(),
    ),
    completedByDay: z.array(
      z.object({ date: IsoDate, value: z.number().int().nonnegative() }).strict(),
    ),
    byStation: z.array(
      z
        .object({ stationId: Id, stationName: z.string(), cards: z.number().int().nonnegative() })
        .strict(),
    ),
  })
  .strict();
export type CardReport = z.infer<typeof CardReport>;

export const GiftReport = z
  .object({
    unit: z.literal('redemptions'),
    total: z.number().int().nonnegative(),
    byGiftType: z.array(
      z
        .object({
          giftTypeId: Id,
          giftTypeName: z.string(),
          redeemed: z.number().int().nonnegative(),
          remaining: z.number().int(),
        })
        .strict(),
    ),
    byDay: z.array(z.object({ date: IsoDate, value: z.number().int().nonnegative() }).strict()),
    byStation: z.array(
      z
        .object({ stationId: Id, stationName: z.string(), value: z.number().int().nonnegative() })
        .strict(),
    ),
  })
  .strict();
export type GiftReport = z.infer<typeof GiftReport>;

export const SafetyReport = z
  .object({
    incidents: z.array(
      z
        .object({
          id: Id,
          type: IncidentType,
          severity: IncidentSeverity,
          status: IncidentStatus,
          stationName: z.string().nullable(),
          occurredAt: IsoDateTime,
          reportedAt: IsoDateTime,
          description: z.string(),
          followUpCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    incidentsByType: z.array(
      z.object({ key: z.string(), value: z.number().int().nonnegative() }).strict(),
    ),
    nearMisses: z.number().int().nonnegative(),
    /**
     * Derived from `LostPersonSummary` only. The descriptions are purged 24
     * hours after resolution and no report is ever allowed to read them
     * (BUILD_PLAN §5.9).
     */
    lostPerson: z
      .object({
        cases: z.number().int().nonnegative(),
        resolved: z.number().int().nonnegative(),
        medianResolutionMinutes: z.number().nullable(),
        byOutcome: z.array(
          z.object({ outcome: LostPersonStatus, value: z.number().int().nonnegative() }).strict(),
        ),
      })
      .strict(),
    lostAndFound: z
      .object({
        logged: z.number().int().nonnegative(),
        claimed: z.number().int().nonnegative(),
        unclaimed: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type SafetyReport = z.infer<typeof SafetyReport>;

export const VolunteerReport = z
  .object({
    volunteersActive: z.number().int().nonnegative(),
    assignments: z.number().int().nonnegative(),
    checkedIn: z.number().int().nonnegative(),
    /** Shifts whose block has ended with nobody checked in. */
    noShows: z.number().int().nonnegative(),
    /** Shifts not yet ended and not checked in: neither attended nor missed. */
    notYetDue: z.number().int().nonnegative(),
    /** No-shows as a share of the shifts that are due (ended, or checked in). */
    noShowRate: z.number().min(0).max(1),
    totalHours: z.number().nonnegative(),
    byStation: z.array(
      z
        .object({
          stationId: Id,
          stationName: z.string(),
          assignments: z.number().int().nonnegative(),
          checkedIn: z.number().int().nonnegative(),
          hours: z.number().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export type VolunteerReport = z.infer<typeof VolunteerReport>;

/**
 * The data-integrity section, and the reason this report can be trusted.
 *
 * Every fallback window in the range is listed with its duration, and the
 * counts are split by source. The reader should be able to see exactly which
 * hours are approximate without having to ask anybody.
 */
export const DataIntegrityReport = z
  .object({
    containsFallbackData: z.boolean(),
    fallbackWindows: z.array(FallbackWindowRecord),
    /** Total minutes of degraded operation across the range. */
    degradedMinutes: z.number().int().nonnegative(),
    recordsBySource: z.array(
      z
        .object({
          table: z.string(),
          source: z.string(),
          value: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    imports: z.array(
      z
        .object({
          id: Id,
          source: z.string(),
          targetTable: z.string(),
          rowCount: z.number().int().nonnegative(),
          fileName: z.string().nullable(),
          importedAt: IsoDateTime,
          notes: z.string().nullable(),
        })
        .strict(),
    ),
    /** Voided rows, so corrections are visible rather than merely absent. */
    voidedRecords: z.array(
      z.object({ table: z.string(), value: z.number().int().nonnegative() }).strict(),
    ),
  })
  .strict();
export type DataIntegrityReport = z.infer<typeof DataIntegrityReport>;

export const FullReport = z
  .object({
    generatedAt: IsoDateTime,
    range: z.object({ from: IsoDateTime.nullable(), to: IsoDateTime.nullable() }).strict(),
    /**
     * Stated at the top of every report, in prose, because the single most
     * likely misreading of this document is that these are the same people
     * counted three ways.
     */
    countingNote: z.string(),
    registrations: RegistrationReport,
    footfall: FootfallReport,
    cards: CardReport,
    gifts: GiftReport,
    safety: SafetyReport,
    volunteers: VolunteerReport,
    dataIntegrity: DataIntegrityReport,
  })
  .strict();
export type FullReport = z.infer<typeof FullReport>;

export const ReportExportQuery = ReportQuery.extend({
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
}).strict();
export type ReportExportQuery = z.infer<typeof ReportExportQuery>;
