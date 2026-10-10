import { z } from 'zod';
import { CommitteeRole } from '../../invariants/enums.js';
import { Id, IdempotencyKey, IsoDateTime } from '../common/index.js';
import { UploadContentType } from '../media/index.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const reference = Id;
/** Every field is rendered as text; no HTML or executable markup is accepted as a format. */
export const EventContent = z
  .object({
    schemaVersion: z.literal(1),
    brief: z
      .object({
        escalationScript: text(400),
        fiveThings: z
          .array(
            z
              .object({ text: text(160), roles: z.array(CommitteeRole).min(1).max(6).optional() })
              .strict(),
          )
          .min(1)
          .max(7),
        programmes: z
          .array(
            z
              .object({
                stationTagId: reference,
                oneLiner: text(200),
                faqs: z.array(z.object({ question: text(120), answer: text(300) }).strict()).max(5),
              })
              .strict(),
          )
          .max(30),
      })
      .strict(),
    journey: z
      .object({
        steps: z
          .array(
            z
              .object({
                title: text(40),
                detail: text(200),
                stationIds: z.array(reference).max(20).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(10),
        note: text(300).optional(),
      })
      .strict(),
    map: z
      .object({
        intro: text(200),
        levels: z
          .array(
            z
              .object({
                label: text(40),
                image: z
                  .object({ mediaKey: z.string().min(1).max(240), alt: text(200) })
                  .strict()
                  .optional(),
                points: z
                  .array(
                    z
                      .object({
                        label: text(80),
                        kind: z.enum(['station', 'facility', 'safety']),
                        stationId: reference.optional(),
                      })
                      .strict(),
                  )
                  .max(100),
              })
              .strict(),
          )
          .min(1)
          .max(10),
      })
      .strict(),
    briefing: z.object({ mandatoryPoints: z.array(text(160)).min(1).max(8) }).strict(),
  })
  .strict();
export type EventContent = z.infer<typeof EventContent>;

export const SaveContentDraftRequest = z
  .object({
    idempotencyKey: IdempotencyKey,
    expectedVersion: z.number().int().min(0),
    body: EventContent,
  })
  .strict();
export type SaveContentDraftRequest = z.infer<typeof SaveContentDraftRequest>;
export const ReviewContentRequest = z
  .object({ idempotencyKey: IdempotencyKey, expectedVersion: z.number().int().positive() })
  .strict();
export type ReviewContentRequest = z.infer<typeof ReviewContentRequest>;
export const PublishContentRequest = ReviewContentRequest;
export type PublishContentRequest = z.infer<typeof PublishContentRequest>;
export const ScheduleContentRequest = ReviewContentRequest.extend({ runAt: IsoDateTime }).strict();
export type ScheduleContentRequest = z.infer<typeof ScheduleContentRequest>;
export const PublishContentPayload = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export type PublishContentPayload = z.infer<typeof PublishContentPayload>;
export const ContentVersionQuery = z.object({ v: Id.optional() }).strict();
export type ContentVersionQuery = z.infer<typeof ContentVersionQuery>;
export const CreateContentImageRequest = z
  .object({
    idempotencyKey: IdempotencyKey,
    contentType: UploadContentType,
    contentLength: z
      .number()
      .int()
      .positive()
      .max(1024 * 1024),
  })
  .strict();
export type CreateContentImageRequest = z.infer<typeof CreateContentImageRequest>;

export const ContentDraftRecord = z
  .object({
    eventId: Id,
    version: z.number().int().min(0),
    body: EventContent.nullable(),
    reviewedVersion: z.number().int().positive().nullable(),
    reviewedAt: IsoDateTime.nullable(),
    publishedVersion: Id.nullable(),
    updatedAt: IsoDateTime.nullable(),
  })
  .strict();
export type ContentDraftRecord = z.infer<typeof ContentDraftRecord>;
export const PublishedContentRecord = z
  .object({
    id: Id,
    eventId: Id,
    version: z.number().int().positive(),
    draftVersion: z.number().int().positive(),
    body: EventContent,
    objectKey: z.string(),
    publishedAt: IsoDateTime,
    etag: z.string(),
    path: z.string(),
    images: z.record(z.string(), z.string()),
  })
  .strict();
export type PublishedContentRecord = z.infer<typeof PublishedContentRecord>;
export const ContentImageResponse = z
  .object({
    key: z.string(),
    url: z.url(),
    fields: z.record(z.string(), z.string()),
    expiresIn: z.number().int().positive(),
    maxBytes: z.number().int().positive(),
  })
  .strict();
export type ContentImageResponse = z.infer<typeof ContentImageResponse>;
export const ContentScheduleResponse = z
  .object({ id: Id, runAt: IsoDateTime, expectedVersion: z.number().int().positive() })
  .strict();
export type ContentScheduleResponse = z.infer<typeof ContentScheduleResponse>;
