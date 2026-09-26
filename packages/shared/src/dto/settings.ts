import { z } from 'zod';
import { ShiftBlock } from '../enums.js';
import { Id, IsoDateTime } from './common.js';

/**
 * Runtime settings.
 *
 * Everything here used to be a constant compiled into the server: the shift
 * block boundaries in `platform/time`, the fifteen-minute silence threshold, the
 * implausible-tap rate, the welfare cutoff, the retention windows. Each one is a
 * number somebody wants to change during a dry run — and the shift boundaries in
 * particular decide whether a capture screen works at all, because station
 * scoping requires a block to be running.
 *
 * Changing a value in a redeploy is not the same as changing it at 09:15 on the
 * morning of a rehearsal, so they are stored, versioned by the audit log, and
 * served to both the server and the client from one place.
 *
 * Defaults live in `server/src/platform/settings/index.ts` and every field is optional on
 * the way in, so an empty settings table is a working system and a partial
 * update only touches what it names.
 */

/** Local wall-clock time in Asia/Singapore, `HH:MM` on a 24-hour clock. */
export const WallClockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM on a 24-hour clock');
export type WallClockTime = z.infer<typeof WallClockTime>;

export const ShiftBlockWindow = z
  .object({
    start: WallClockTime,
    end: WallClockTime,
  })
  .strict()
  .refine((w) => w.start < w.end, {
    message: 'a shift block must end after it starts',
    path: ['end'],
  });
export type ShiftBlockWindow = z.infer<typeof ShiftBlockWindow>;

/**
 * The two blocks are enum members in the database, so the set is fixed; their
 * boundaries are not. They are allowed to overlap — the 13:30–14:00 handover is
 * deliberate and means a moment can legitimately belong to both.
 */
export const ShiftBlockWindows = z.record(ShiftBlock, ShiftBlockWindow);
export type ShiftBlockWindows = z.infer<typeof ShiftBlockWindows>;

const Minutes = z.number().int().min(1).max(1440);
const Seconds = z.number().int().min(1).max(3600);

export const RuntimeSettings = z
  .object({
    /** Display name for the event, used in exports and the ops-room display. */
    eventName: z.string().trim().min(1).max(80),

    /** Shift block boundaries. Station scoping is derived from these. */
    shiftBlocks: ShiftBlockWindows,

    /** A counted room silent for this long during event hours is flagged. */
    silentStationMinutes: Minutes,
    /** A checked-in device that has captured nothing for this long is flagged. */
    staleDeviceMinutes: Minutes,
    /** Registrations per minute above which the IC console flags an anomaly. */
    implausibleTapsPerMinute: z.number().min(1).max(600),
    /** Time on station without a break before the welfare list picks someone up. */
    longShiftMinutes: Minutes,

    /** How long a resolved lost-person alert keeps its descriptive fields. */
    lostPersonPurgeHours: z.number().int().min(1).max(720),
    /** How long a settled idempotency record is kept for replay. */
    idempotencyRetentionDays: z.number().int().min(1).max(90),
    /** How long a refresh session lives before the volunteer signs in again. */
    refreshSessionDays: z.number().int().min(1).max(90),

    /** Client poll cadence for the live dashboard and the ops-room display. */
    dashboardPollSeconds: Seconds,
    /** Client poll cadence for active lost-person alerts. */
    alertPollSeconds: Seconds,

    /** How long undo stays available after a capture tap. */
    captureUndoWindowSeconds: Seconds,
    /** How long a tap waits before its first send, so undo can still cancel it. */
    captureSendGraceSeconds: Seconds,
    /** Unsent captures above which the volunteer is told to find their IC. */
    outboxWarningCount: z.number().int().min(1).max(1000),
    /** Age of the oldest unsent capture that triggers the same warning. */
    outboxWarningAgeMinutes: Minutes,
  })
  .strict();
export type RuntimeSettings = z.infer<typeof RuntimeSettings>;

/** A patch. Every key optional; absent keys are left alone. */
export const UpdateSettingsRequest = RuntimeSettings.partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one setting to change',
  });
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequest>;

export const SettingsResponse = z
  .object({
    settings: RuntimeSettings,
    /**
     * Which keys are stored rather than falling back to a compiled default.
     * The admin screen renders an overridden value differently, because "this
     * was changed by somebody" and "this is the default" are different facts.
     */
    overriddenKeys: z.array(z.string()),
    updatedAt: IsoDateTime.nullable(),
    updatedById: Id.nullable(),
    updatedByName: z.string().nullable(),
  })
  .strict();
export type SettingsResponse = z.infer<typeof SettingsResponse>;
