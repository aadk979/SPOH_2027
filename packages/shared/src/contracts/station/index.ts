import { z } from 'zod';
import { Id } from '../common/index.js';

/**
 * What a station is, as the event defines it (ADR-002): its capabilities are
 * flags on the type, so behaviour never depends on a kind's name.
 */
export const StationTypeSummary = z
  .object({
    id: Id,
    code: z.string(),
    label: z.string(),
    /** Visitors are registered here: the sign-up booth. */
    registersVisitors: z.boolean(),
    countsEntry: z.boolean(),
    issuesStamp: z.boolean(),
    /** Gifts are handed out here: mission complete. */
    redeemsGifts: z.boolean(),
  })
  .strict();
export type StationTypeSummary = z.infer<typeof StationTypeSummary>;

/** A label the event puts on stations, such as the course a room presents. */
export const StationTagSummary = z.object({ id: Id, code: z.string(), label: z.string() }).strict();
export type StationTagSummary = z.infer<typeof StationTagSummary>;

export const StationSummary = z
  .object({
    id: Id,
    code: z.string(),
    name: z.string(),
    type: StationTypeSummary,
    tags: z.array(StationTagSummary),
    floor: z.string().nullable(),
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
    /** One of the event's station types, by code: what happens there (ADR-002). */
    typeCode: z.string().trim().min(1).max(64),
    /** The event's tags for it, by code (a course a room presents). */
    tagCodes: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
    floor: z.string().trim().max(40).nullish(),
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
