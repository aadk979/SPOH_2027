import { z } from 'zod';
import { Id, PaginationQuery } from '../common/index.js';
import { RegistrationRecord } from '../registration/index.js';
import { FootfallTickRecord } from '../footfall/index.js';

/** A chosen station and mode keep live corrections separate from practice records. */
export const RecentCorrectionRecordsQuery = PaginationQuery.extend({
  stationId: Id,
  rehearsal: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
}).strict();
export type RecentCorrectionRecordsQuery = z.infer<typeof RecentCorrectionRecordsQuery>;
const meta = z
  .object({ count: z.number().int().nonnegative(), nextCursor: Id.nullable() })
  .strict();
export const RecentRegistrationsResponse = z
  .object({ data: z.array(RegistrationRecord), meta })
  .strict();
export type RecentRegistrationsResponse = z.infer<typeof RecentRegistrationsResponse>;
export const RecentFootfallResponse = z
  .object({ data: z.array(FootfallTickRecord), meta })
  .strict();
export type RecentFootfallResponse = z.infer<typeof RecentFootfallResponse>;
