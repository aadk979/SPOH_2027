import { z } from 'zod';
import { Capability } from '../capabilities.js';
import { CommitteeRole, ShiftBlock } from '../enums.js';
import { Id, IsoDate, IsoDateTime } from './common.js';
import { StationSummary } from './station.js';

/** A volunteer the caller may need to contact — their IC, their Deputy, the Chief. */
export const ContactCard = z
  .object({
    id: Id,
    displayName: z.string(),
    role: CommitteeRole,
    phone: z.string().nullable(),
    portfolio: z.string().nullable(),
  })
  .strict();
export type ContactCard = z.infer<typeof ContactCard>;

export const MyAssignment = z
  .object({
    id: Id,
    eventDayId: Id,
    date: IsoDate,
    dayLabel: z.string(),
    block: ShiftBlock,
    roleLabel: z.string(),
    station: StationSummary,
    checkedInAt: IsoDateTime.nullable(),
    checkedOutAt: IsoDateTime.nullable(),
  })
  .strict();
export type MyAssignment = z.infer<typeof MyAssignment>;

/**
 * `GET /me` — the single call the client makes on boot. It carries everything
 * needed to render the role-scoped home screen (BUILD_PLAN §9.3) without a
 * second round trip: who I am, what I may do, and where I am posted right now.
 */
export const MeResponse = z
  .object({
    volunteer: z
      .object({
        id: Id,
        displayName: z.string(),
        role: CommitteeRole,
        portfolio: z.string().nullable(),
        active: z.boolean(),
      })
      .strict(),
    /** Server-computed from the capability matrix. The client never derives it. */
    capabilities: z.array(Capability),
    /** Today's assignment, if the caller is on shift. */
    currentAssignment: MyAssignment.nullable(),
    /** Every assignment for the caller across the event, for the shift screen. */
    upcomingAssignments: z.array(MyAssignment),
    /** My IC, my Deputy Coordinator, the Chief — the escalation chain. */
    escalationChain: z.array(ContactCard),
    serverTime: IsoDateTime,
  })
  .strict();
export type MeResponse = z.infer<typeof MeResponse>;

export const CheckInRequest = z
  .object({
    assignmentId: Id,
  })
  .strict();
export type CheckInRequest = z.infer<typeof CheckInRequest>;

export const CheckInResponse = z.object({ assignment: MyAssignment }).strict();
export type CheckInResponse = z.infer<typeof CheckInResponse>;
