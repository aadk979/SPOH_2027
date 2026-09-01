import { z } from 'zod';
import { IncidentSeverity, IncidentStatus, IncidentType } from '../enums.js';
import { Id, IdempotencyKey, IsoDateTime, PaginationQuery } from './common.js';

/**
 * Incident reporting (PRODUCT_BRIEF §7.1).
 *
 * `description` is the one free-text field a volunteer can reach, and the UI
 * labels it "describe the event, not the people". It is deliberately not
 * exposed on any visitor-facing capture flow.
 */

export const IncidentDescription = z.string().trim().min(10).max(2000);

export const CreateIncidentRequest = z
  .object({
    idempotencyKey: IdempotencyKey,
    type: IncidentType,
    severity: IncidentSeverity,
    /** Pre-filled from the reporter's current station; may be null if roaming. */
    stationId: Id.nullish(),
    locationNote: z.string().trim().max(200).optional(),
    description: IncidentDescription,
    occurredAt: IsoDateTime,
  })
  .strict();
export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequest>;

export const IncidentFollowUpRecord = z
  .object({
    id: Id,
    note: z.string(),
    authorId: Id,
    authorName: z.string(),
    createdAt: IsoDateTime,
  })
  .strict();
export type IncidentFollowUpRecord = z.infer<typeof IncidentFollowUpRecord>;

/** Immutable once submitted; corrections go in the append-only follow-up log. */
export const IncidentRecord = z
  .object({
    id: Id,
    type: IncidentType,
    severity: IncidentSeverity,
    status: IncidentStatus,
    stationId: Id.nullable(),
    stationName: z.string().nullable(),
    locationNote: z.string().nullable(),
    description: z.string(),
    reportedById: Id,
    reportedByName: z.string(),
    occurredAt: IsoDateTime,
    reportedAt: IsoDateTime,
    followUps: z.array(IncidentFollowUpRecord),
  })
  .strict();
export type IncidentRecord = z.infer<typeof IncidentRecord>;

export const CreateIncidentFollowUpRequest = z
  .object({
    note: z.string().trim().min(3).max(2000),
  })
  .strict();
export type CreateIncidentFollowUpRequest = z.infer<typeof CreateIncidentFollowUpRequest>;

export const UpdateIncidentStatusRequest = z
  .object({
    status: IncidentStatus,
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
export type UpdateIncidentStatusRequest = z.infer<typeof UpdateIncidentStatusRequest>;

export const ListIncidentsQuery = PaginationQuery.extend({
  status: IncidentStatus.optional(),
  severity: IncidentSeverity.optional(),
  stationId: Id.optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
}).strict();
export type ListIncidentsQuery = z.infer<typeof ListIncidentsQuery>;
