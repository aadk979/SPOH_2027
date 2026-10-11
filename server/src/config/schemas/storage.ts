import { z } from 'zod';

/** S3 media storage, and the CloudWatch log group that keeps a copy of the audit trail. */
export const storageFields = {
  S3_MEDIA_BUCKET: z.string().optional(),
  S3_CONTENT_BUCKET: z.string().optional(),
  S3_EXPORTS_BUCKET: z.string().optional(),
  AUDIT_LOG_GROUP: z.string().min(1).max(512).optional(),
  AWS_REGION: z.string().default('ap-southeast-1'),
};
