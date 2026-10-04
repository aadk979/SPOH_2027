import { z } from 'zod';
import { CreateUploadRequest } from '@spoh/shared';

/** Durable replay retains one bounded object identifier, never an S3 credential. */
export const MediaUploadReceipt = z.object({ key: z.string().min(1).max(200) }).strict();
export type MediaUploadReceipt = z.infer<typeof MediaUploadReceipt>;

/** Only curated immutable upload metadata can recreate the original intent. */
export const MediaUploadAuditIntent = z
  .object({
    purpose: CreateUploadRequest.shape.purpose,
    contentType: CreateUploadRequest.shape.contentType,
    contentLength: CreateUploadRequest.shape.contentLength,
    rehearsal: z.boolean(),
  })
  .strict();
