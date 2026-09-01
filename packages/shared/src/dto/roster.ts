import { z } from 'zod';
import { CommitteeRole, ShiftBlock } from '../enums.js';
import { Id, IsoDate, IsoDateTime } from './common.js';

/**
 * Roster and provisioning (BUILD_PLAN §6.1, §7.2).
 *
 * This is the one schema in the system that holds names, emails and phone
 * numbers — and that is fine: it is committee data, not visitor data. It lives
 * apart from every capture model and is archived after the post-event report is
 * signed off (PRODUCT_BRIEF §0.2).
 */

export const VolunteerEmail = z.email().max(254).toLowerCase();
/** Loose on format because Singapore numbers get written a dozen ways. */
export const VolunteerPhone = z.string().trim().min(6).max(32);

export const ProvisionVolunteerRequest = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    email: VolunteerEmail,
    phone: VolunteerPhone.optional(),
    role: CommitteeRole.default('VOLUNTEER'),
    portfolio: z.string().trim().max(120).optional(),
    reportsToEmail: VolunteerEmail.optional(),
  })
  .strict();
export type ProvisionVolunteerRequest = z.infer<typeof ProvisionVolunteerRequest>;

export const VolunteerRecord = z
  .object({
    id: Id,
    displayName: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    role: CommitteeRole,
    portfolio: z.string().nullable(),
    reportsToId: Id.nullable(),
    active: z.boolean(),
    createdAt: IsoDateTime,
  })
  .strict();
export type VolunteerRecord = z.infer<typeof VolunteerRecord>;

export const ProvisionVolunteerResponse = z
  .object({
    volunteer: VolunteerRecord,
    /** True when a Cognito account was created as part of this call. */
    identityCreated: z.boolean(),
  })
  .strict();
export type ProvisionVolunteerResponse = z.infer<typeof ProvisionVolunteerResponse>;

/**
 * Roster CSV import. Runs as a dry-run preview first: nothing is written until
 * the caller re-posts with `commit: true`. Importing 200 volunteers is exactly
 * the kind of action you want to see the diff of before it happens.
 */
export const RosterImportRow = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    email: VolunteerEmail,
    phone: VolunteerPhone.optional(),
    role: CommitteeRole.default('VOLUNTEER'),
    portfolio: z.string().trim().max(120).optional(),
    reportsToEmail: VolunteerEmail.optional(),
    stationCode: z.string().trim().max(64).optional(),
    eventDate: IsoDate.optional(),
    block: ShiftBlock.optional(),
    roleLabel: z.string().trim().max(64).optional(),
  })
  .strict();
export type RosterImportRow = z.infer<typeof RosterImportRow>;

export const RosterImportRequest = z
  .object({
    rows: z.array(RosterImportRow).min(1).max(1000),
    commit: z.boolean().default(false),
  })
  .strict();
export type RosterImportRequest = z.infer<typeof RosterImportRequest>;

export const RosterImportIssue = z
  .object({
    rowNumber: z.number().int().positive(),
    field: z.string(),
    message: z.string(),
  })
  .strict();
export type RosterImportIssue = z.infer<typeof RosterImportIssue>;

export const RosterImportResponse = z
  .object({
    committed: z.boolean(),
    volunteersCreated: z.number().int().nonnegative(),
    volunteersUpdated: z.number().int().nonnegative(),
    assignmentsCreated: z.number().int().nonnegative(),
    assignmentsUpdated: z.number().int().nonnegative(),
    issues: z.array(RosterImportIssue),
  })
  .strict();
export type RosterImportResponse = z.infer<typeof RosterImportResponse>;

export const ShiftAssignmentRecord = z
  .object({
    id: Id,
    volunteerId: Id,
    volunteerName: z.string(),
    volunteerPhone: z.string().nullable(),
    stationId: Id,
    stationName: z.string(),
    eventDayId: Id,
    date: IsoDate,
    block: ShiftBlock,
    roleLabel: z.string(),
    checkedInAt: IsoDateTime.nullable(),
    checkedOutAt: IsoDateTime.nullable(),
  })
  .strict();
export type ShiftAssignmentRecord = z.infer<typeof ShiftAssignmentRecord>;
