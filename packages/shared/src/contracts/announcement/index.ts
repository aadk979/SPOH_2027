import { z } from 'zod';
import { AnnouncementPriority, CommitteeRole } from '../../invariants/enums.js';
import { Id, IdempotencyKey, IsoDateTime, PaginationQuery } from '../common/index.js';

/**
 * Broadcast and comms (PRODUCT_BRIEF §8).
 *
 * Quiet by default is the load-bearing rule. Only URGENT messages push;
 * everything else lands in an inbox. Volunteers who receive forty pushes stop
 * reading pushes by 11am, and then the one that matters is the one they miss.
 */

export const AnnouncementTarget = z
  .object({
    /** Everyone in this role. Null means every role. */
    role: CommitteeRole.nullish(),
    /** Everyone rostered at this station today. Null means every station. */
    stationId: Id.nullish(),
    /** Restricts to one event day. Null means today onwards. */
    eventDayId: Id.nullish(),
  })
  .strict();
export type AnnouncementTarget = z.infer<typeof AnnouncementTarget>;

export const CreateAnnouncementRequest = z
  .object({
    body: z.string().trim().min(3).max(1000),
    priority: AnnouncementPriority.default('INFO'),
    target: AnnouncementTarget.default({}),
    /** Critical messages ask for an acknowledgement so reach is measurable. */
    requiresAck: z.boolean().default(false),
    expiresAt: IsoDateTime.optional(),
  })
  .strict();
export type CreateAnnouncementRequest = z.infer<typeof CreateAnnouncementRequest>;

/** Saving a draft never publishes to an inbox or requests device delivery. */
export const CreateAnnouncementDraftRequest = CreateAnnouncementRequest.extend({
  idempotencyKey: IdempotencyKey,
}).strict();
export type CreateAnnouncementDraftRequest = z.infer<typeof CreateAnnouncementDraftRequest>;

/** Full replacement under an optimistic version; attribution remains server-owned. */
export const UpdateAnnouncementDraftRequest = CreateAnnouncementRequest.extend({
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();
export type UpdateAnnouncementDraftRequest = z.infer<typeof UpdateAnnouncementDraftRequest>;

export const AnnouncementDraftRecord = CreateAnnouncementRequest.extend({
  id: Id,
  eventId: Id,
  authorId: Id,
  authorMembershipId: Id,
  version: z.number().int().min(1),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  expiresAt: IsoDateTime.nullable(),
}).strict();
export type AnnouncementDraftRecord = z.infer<typeof AnnouncementDraftRecord>;

export const AnnouncementRecord = z
  .object({
    id: Id,
    body: z.string(),
    priority: AnnouncementPriority,
    targetRole: CommitteeRole.nullable(),
    targetStationId: Id.nullable(),
    targetStationName: z.string().nullable(),
    targetEventDayId: Id.nullable(),
    requiresAck: z.boolean(),
    authorId: Id,
    authorName: z.string(),
    createdAt: IsoDateTime,
    expiresAt: IsoDateTime.nullable(),
    ackCount: z.number().int().nonnegative(),
    ackedByMe: z.boolean(),
    /** How many people the message was addressed to, for the sender's view. */
    audienceCount: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type AnnouncementRecord = z.infer<typeof AnnouncementRecord>;

export const ListAnnouncementsQuery = PaginationQuery.extend({
  /** Only messages still awaiting my acknowledgement. */
  unackedOnly: z.coerce.boolean().default(false),
}).strict();
export type ListAnnouncementsQuery = z.infer<typeof ListAnnouncementsQuery>;
