import { z } from 'zod';

/** S3 media storage. */
export const storageFields = {
  S3_MEDIA_BUCKET: z.string().optional(),
  S3_CONTENT_BUCKET: z.string().optional(),
  S3_EXPORTS_BUCKET: z.string().optional(),
  AWS_REGION: z.string().default('ap-southeast-1'),
};
