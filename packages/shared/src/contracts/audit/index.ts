import { z } from 'zod';
import { Id, IsoDateTime, PaginationQuery } from '../common/index.js';

export const AuditQuery = PaginationQuery.extend({
  action: z.string().trim().max(64).optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: Id.optional(),
  actorId: Id.optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
}).strict();
export type AuditQuery = z.infer<typeof AuditQuery>;
export const AuditEntryRecord = z
  .object({
    id: Id,
    action: z.string(),
    entityType: z.string(),
    entityId: Id.nullable(),
    actorId: Id.nullable(),
    actorName: z.string(),
    before: z.json().nullable(),
    after: z.json().nullable(),
    requestId: z.string().nullable(),
    createdAt: IsoDateTime,
  })
  .strict();
export type AuditEntryRecord = z.infer<typeof AuditEntryRecord>;
export const AuditLogResponse = z
  .object({
    data: z.array(AuditEntryRecord),
    meta: z.object({ count: z.number().int().nonnegative(), nextCursor: Id.nullable() }).strict(),
  })
  .strict();
export type AuditLogResponse = z.infer<typeof AuditLogResponse>;
