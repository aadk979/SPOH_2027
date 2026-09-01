import { z } from 'zod';
import { Id, IsoDateTime } from './common.js';
import { FootfallLiveStation } from './footfall.js';
import { FunnelStage } from './missionCard.js';
import { GiftTypeRecord } from './gift.js';
import { LongShiftWarning, StaffingGap } from './shift.js';

/**
 * The live operations dashboard (PRODUCT_BRIEF §9).
 *
 * One screen for the Chief Coordinator, built for glancing at while walking.
 * Delivered as a single payload polled every 3 seconds rather than over a
 * WebSocket: the payload is small, the client count is under 20, and polling is
 * dramatically simpler to operate and debug on event day (BUILD_PLAN §7.3).
 *
 * Every count on it carries its unit. There is no combined figure anywhere,
 * because there is no honest way to produce one.
 */

export const RegistrationLiveBreakdown = z
  .object({
    unit: z.literal('registrations'),
    todayTotal: z.number().int().nonnegative(),
    byCategory: z.array(
      z.object({ key: z.string(), value: z.number().int().nonnegative() }).strict(),
    ),
    /**
     * Registrations in the last sixty minutes. An implausible rate usually
     * means someone is tapping to catch up rather than counting (§2.4).
     */
    lastHour: z.number().int().nonnegative(),
  })
  .strict();
export type RegistrationLiveBreakdown = z.infer<typeof RegistrationLiveBreakdown>;

export const FootfallLiveBreakdown = z
  .object({
    unit: z.literal('roomEntries'),
    todayTotal: z.number().int().nonnegative(),
    stations: z.array(FootfallLiveStation),
  })
  .strict();
export type FootfallLiveBreakdown = z.infer<typeof FootfallLiveBreakdown>;

export const CardLiveBreakdown = z
  .object({
    unit: z.literal('cards'),
    issued: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    redeemed: z.number().int().nonnegative(),
    stages: z.array(FunnelStage),
  })
  .strict();
export type CardLiveBreakdown = z.infer<typeof CardLiveBreakdown>;

export const SafetyLiveBreakdown = z
  .object({
    openIncidents: z.number().int().nonnegative(),
    criticalIncidents: z.number().int().nonnegative(),
    activeLostPersonAlerts: z.number().int().nonnegative(),
  })
  .strict();
export type SafetyLiveBreakdown = z.infer<typeof SafetyLiveBreakdown>;

/**
 * Data health (PRODUCT_BRIEF §9).
 *
 * The early warning that a station has quietly stopped recording. This matters
 * more than any server metric: the API can be perfectly healthy while a room
 * counts nothing for an hour, and a total alone would never reveal it.
 */
export const DataHealthResponse = z
  .object({
    asOf: IsoDateTime,
    /** Counted rooms with no activity for 15+ minutes during event hours. */
    silentStations: z.array(
      z
        .object({
          stationId: Id,
          stationName: z.string(),
          lastActivityAt: IsoDateTime.nullable(),
          minutesSinceLastActivity: z.number().int().nonnegative().nullable(),
        })
        .strict(),
    ),
    /** Volunteers checked in but who have recorded nothing for 15+ minutes. */
    staleDevices: z.array(
      z
        .object({
          volunteerId: Id,
          volunteerName: z.string(),
          stationName: z.string(),
          lastCaptureAt: IsoDateTime.nullable(),
          minutesSinceLastCapture: z.number().int().nonnegative().nullable(),
        })
        .strict(),
    ),
    /** True while a fallback window is open — the data is knowingly degraded. */
    fallbackWindowOpen: z.boolean(),
    /** Whether event hours are running; outside them, silence is expected. */
    withinEventHours: z.boolean(),
  })
  .strict();
export type DataHealthResponse = z.infer<typeof DataHealthResponse>;

export const StaffingLiveBreakdown = z
  .object({
    onShift: z.number().int().nonnegative(),
    checkedIn: z.number().int().nonnegative(),
    gaps: z.array(StaffingGap),
    longShifts: z.array(LongShiftWarning),
  })
  .strict();
export type StaffingLiveBreakdown = z.infer<typeof StaffingLiveBreakdown>;

export const LiveDashboardResponse = z
  .object({
    asOf: IsoDateTime,
    eventDayLabel: z.string().nullable(),
    withinEventHours: z.boolean(),
    registrations: RegistrationLiveBreakdown,
    footfall: FootfallLiveBreakdown,
    cards: CardLiveBreakdown,
    gifts: z.array(GiftTypeRecord),
    safety: SafetyLiveBreakdown,
    staffing: StaffingLiveBreakdown,
    dataHealth: DataHealthResponse,
  })
  .strict();
export type LiveDashboardResponse = z.infer<typeof LiveDashboardResponse>;

/** The same picture, scoped to one station, for an IC. */
export const StationDashboardResponse = z
  .object({
    asOf: IsoDateTime,
    stationId: Id,
    stationName: z.string(),
    registrations: z
      .object({
        unit: z.literal('registrations'),
        todayTotal: z.number().int().nonnegative(),
        byCategory: z.array(
          z.object({ key: z.string(), value: z.number().int().nonnegative() }).strict(),
        ),
        /** Per-device contribution, so two people on one queue see the drift. */
        byDevice: z.array(
          z
            .object({
              volunteerId: Id,
              volunteerName: z.string(),
              value: z.number().int().nonnegative(),
              perMinute: z.number(),
              /** Flags an implausible tapping rate for the IC to look at. */
              rateAnomaly: z.boolean(),
            })
            .strict(),
        ),
      })
      .strict(),
    footfall: z
      .object({
        unit: z.literal('roomEntries'),
        todayTotal: z.number().int().nonnegative(),
        lastActivityAt: IsoDateTime.nullable(),
        contributors: z.array(
          z
            .object({
              volunteerId: Id,
              volunteerName: z.string(),
              value: z.number().int().nonnegative(),
              lastActivityAt: IsoDateTime.nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
    stamps: z.number().int().nonnegative(),
    roster: z.array(
      z
        .object({
          volunteerId: Id,
          volunteerName: z.string(),
          roleLabel: z.string(),
          checkedInAt: IsoDateTime.nullable(),
          checkedOutAt: IsoDateTime.nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type StationDashboardResponse = z.infer<typeof StationDashboardResponse>;
