import { z } from 'zod';

export const NoticeDeliveryStatus = z.enum(['PENDING', 'RUNNING', 'SENT', 'SKIPPED', 'DEAD']);
export type NoticeDeliveryStatus = z.infer<typeof NoticeDeliveryStatus>;
export const NoticeDeliveryError = z.enum([
  'UNCONFIGURED', 'PUSH_DISABLED', 'RECIPIENT_INACTIVE', 'RECIPIENT_OUT_OF_SCOPE',
  'SUBSCRIPTION_GONE', 'SUBSCRIPTION_REASSIGNED', 'EXPIRED', 'ARCHIVED',
  'SOURCE_UNAVAILABLE', 'SOURCE_CHANGED', 'PUSH_FAILED', 'RETRY_EXHAUSTED',
]);
export type NoticeDeliveryError = z.infer<typeof NoticeDeliveryError>;
