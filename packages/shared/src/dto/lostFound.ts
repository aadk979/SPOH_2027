import { z } from 'zod';
import { LostFoundStatus } from '../enums.js';
import { Id, IsoDateTime, PaginationQuery } from './common.js';

/**
 * Lost and found (PRODUCT_BRIEF §7.2).
 *
 * The least urgent of the three safety flows, and the first time the event
 * would actually have the number. Slide 48 tracks lost-and-found cases as a
 * metric; until now that number was somebody's recollection.
 *
 * Note what is NOT here: nothing about the person who lost the item or the
 * person who claimed it. An item is described, a location is recorded, and a
 * claim is a status change. Storing "claimed by Mrs Tan" would put visitor
 * personal data into a system that has none (§0.2).
 */

export const CreateLostFoundRequest = z
  .object({
    itemLabel: z.string().trim().min(2).max(120),
    categoryLabel: z.string().trim().max(60).optional(),
    foundStationId: Id.nullish(),
    foundAt: IsoDateTime.optional(),
    /** Where it is being kept — "held at Mission Complete desk". */
    holderNote: z.string().trim().max(200).optional(),
    /** S3 key for a photo of the item. Never of a person. */
    photoKey: z.string().trim().max(200).optional(),
  })
  .strict();
export type CreateLostFoundRequest = z.infer<typeof CreateLostFoundRequest>;

export const LostFoundRecord = z
  .object({
    id: Id,
    itemLabel: z.string(),
    categoryLabel: z.string().nullable(),
    foundStationId: Id.nullable(),
    foundStationName: z.string().nullable(),
    foundAt: IsoDateTime,
    holderNote: z.string().nullable(),
    photoKey: z.string().nullable(),
    status: LostFoundStatus,
    loggedById: Id,
    loggedByName: z.string(),
    claimedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
  })
  .strict();
export type LostFoundRecord = z.infer<typeof LostFoundRecord>;

export const ListLostFoundQuery = PaginationQuery.extend({
  status: LostFoundStatus.optional(),
  /** Free-text search over the item label, for the desk. */
  q: z.string().trim().max(120).optional(),
}).strict();
export type ListLostFoundQuery = z.infer<typeof ListLostFoundQuery>;

export const ClaimLostFoundRequest = z
  .object({
    /** Where the claim happened, not who made it. */
    note: z.string().trim().max(200).optional(),
  })
  .strict();
export type ClaimLostFoundRequest = z.infer<typeof ClaimLostFoundRequest>;
