import { z } from 'zod';
import { ShiftBlock, SwapStatus } from '../enums.js';
import { Id, IsoDate, IsoDateTime, ReasonText } from './common.js';

/**
 * Shift swaps, briefing waves and staffing gaps (PRODUCT_BRIEF §6).
 */

/**
 * A swap request. The volunteer proposes, an IC approves, and the whole thing
 * is an audit trail — slide 54 asks briefers to arrange their own swaps, and
 * this makes that two taps instead of a WhatsApp thread nobody can reconstruct
 * afterwards.
 */
export const CreateSwapRequest = z
  .object({
    assignmentId: Id,
    /** Who is being asked to take the shift. */
    targetVolunteerId: Id,
    reason: ReasonText.optional(),
  })
  .strict();
export type CreateSwapRequest = z.infer<typeof CreateSwapRequest>;

export const DecideSwapRequest = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type DecideSwapRequest = z.infer<typeof DecideSwapRequest>;

export const SwapRequestRecord = z
  .object({
    id: Id,
    assignmentId: Id,
    stationName: z.string(),
    date: IsoDate,
    block: ShiftBlock,
    requesterId: Id,
    requesterName: z.string(),
    targetId: Id,
    targetName: z.string(),
    status: SwapStatus,
    reason: z.string().nullable(),
    decidedById: Id.nullable(),
    decidedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
  })
  .strict();
export type SwapRequestRecord = z.infer<typeof SwapRequestRecord>;

/**
 * Briefing wave roster (PRODUCT_BRIEF §6.2).
 *
 * Waves of 20 Sec 4 students every 30 minutes across 6–7 January, one briefer
 * per wave, rotating through the Chief and the five Deputy Coordinators, about
 * five minutes each. The value is the "you're up next" card and the ten-minute
 * reminder, not the schedule itself.
 */
export const BriefingSlotRecord = z
  .object({
    id: Id,
    eventDayId: Id,
    date: IsoDate,
    startsAt: IsoDateTime,
    briefierId: Id.nullable(),
    briefierName: z.string().nullable(),
    waveSize: z.number().int().positive(),
    completedAt: IsoDateTime.nullable(),
    notes: z.string().nullable(),
    /** True for the slot this caller is briefing next. */
    isMine: z.boolean(),
    minutesUntilStart: z.number().int(),
  })
  .strict();
export type BriefingSlotRecord = z.infer<typeof BriefingSlotRecord>;

export const ListBriefingSlotsQuery = z
  .object({ eventDayId: Id.optional(), date: IsoDate.optional() })
  .strict();
export type ListBriefingSlotsQuery = z.infer<typeof ListBriefingSlotsQuery>;

export const CompleteBriefingSlotRequest = z
  .object({ notes: z.string().trim().max(500).optional() })
  .strict();
export type CompleteBriefingSlotRequest = z.infer<typeof CompleteBriefingSlotRequest>;

/**
 * The four mandatory brief points, shown during the slot so a briefer working
 * from memory at 11:30 on day two does not drop one.
 *
 * ⚠ PLACEHOLDER wording, pending the Chief Coordinator's sign-off.
 */
export const MANDATORY_BRIEF_POINTS: readonly string[] = Object.freeze([
  'Welcome, and what the School of Computing is.',
  'The Mission Card: what it is, and that the stamps are the point.',
  'The route: Welcome Lounge, the three course stations, Mission Complete.',
  'Safety: where the exits are, and who to find if anything goes wrong.',
]);

/**
 * A staffing gap: a station with nobody rostered, or nobody checked in, during
 * a block that is running right now. This is what the Chief looks at when
 * someone does not turn up.
 */
export const StaffingGap = z
  .object({
    stationId: Id,
    stationName: z.string(),
    block: ShiftBlock,
    assigned: z.number().int().nonnegative(),
    checkedIn: z.number().int().nonnegative(),
    /** Assigned but never checked in — the likely no-shows. */
    missing: z.number().int().nonnegative(),
    severity: z.enum(['UNSTAFFED', 'NOBODY_CHECKED_IN', 'PARTIAL']),
  })
  .strict();
export type StaffingGap = z.infer<typeof StaffingGap>;

export const StaffingGapsResponse = z
  .object({
    asOf: IsoDateTime,
    activeBlocks: z.array(ShiftBlock),
    gaps: z.array(StaffingGap),
  })
  .strict();
export type StaffingGapsResponse = z.infer<typeof StaffingGapsResponse>;

/**
 * Welfare: anyone on station for three hours or more without a recorded break
 * (PRODUCT_BRIEF §6.1, slide 39). Derived from check-in time, because a break
 * nobody records is a break nobody can be reminded to take.
 */
export const LongShiftWarning = z
  .object({
    volunteerId: Id,
    volunteerName: z.string(),
    stationName: z.string(),
    checkedInAt: IsoDateTime,
    minutesOnStation: z.number().int().nonnegative(),
  })
  .strict();
export type LongShiftWarning = z.infer<typeof LongShiftWarning>;
