import { z } from 'zod';
import { Id, IsoDateTime, PaginationQuery } from '@spoh/shared';

/** Filters for the audit log: action, entity, actor and a time range. */
export const AuditQuery = PaginationQuery.extend({
  action: z.string().trim().max(64).optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: Id.optional(),
  actorId: Id.optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
}).strict();
