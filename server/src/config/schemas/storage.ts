import { z } from 'zod';

/** S3 media storage. */
export const storageFields = {
  S3_MEDIA_BUCKET: z.string().optional(),
  AWS_REGION: z.string().default('ap-southeast-1'),
  /** Seconds a presigned upload policy stays valid. */
  S3_UPLOAD_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  /** Ceiling written into the presigned policy, so S3 enforces it too. */
  S3_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(50 * 1024 * 1024)
    .default(10 * 1024 * 1024),
};
