import { z } from 'zod';
import { CourseCode, StationKind } from '../../invariants/enums.js';
import { Id } from '../common/index.js';

export const StationSummary = z
  .object({
    id: Id,
    code: z.string(),
    name: z.string(),
    kind: StationKind,
    courseCode: CourseCode.nullable(),
    floor: z.string().nullable(),
    /** Is this one of the rooms whose entries are counted (PRODUCT_BRIEF §3). */
    countsEntry: z.boolean(),
    /** Does a Mission Card get stamped here. */
    issuesStamp: z.boolean(),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict();
export type StationSummary = z.infer<typeof StationSummary>;

// Administering stations (`config.manage`). A station added on the morning of an
// event day is ordinary, and must not need a deploy.

/**
 * Station codes are referenced by every fallback import CSV, so they are
 * constrained to something a person can type into a spreadsheet without
 * ambiguity and are immutable once created.
 */
export const StationCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(64)
  .regex(/^[A-Z0-9_]+$/, 'use A-Z, 0-9 and underscores only');

export const CreateStationRequest = z
  .object({
    code: StationCode,
    name: z.string().trim().min(1).max(120),
    kind: StationKind,
    courseCode: CourseCode.nullish(),
    floor: z.string().trim().max(40).nullish(),
    countsEntry: z.boolean().default(false),
    issuesStamp: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();
export type CreateStationRequest = z.infer<typeof CreateStationRequest>;

/**
 * `code` is absent by design: it is the join key for every import file and
 * every seeded roster CSV, and renaming it would silently orphan them.
 */
export const UpdateStationRequest = CreateStationRequest.omit({ code: true })
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one field to change',
  });
export type UpdateStationRequest = z.infer<typeof UpdateStationRequest>;
