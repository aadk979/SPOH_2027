import { Router } from 'express';
import { z } from 'zod';
import { Id, IsoDateTime, PaginationQuery } from '@spoh/shared';
import { requireAuth } from '../../../platform/identity/index.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/access/index.js';
import { validate } from '../../../platform/http/validate.js';
import { listAuditLogHandler } from './handlers.js';

/**
 * The audit log (BUILD_PLAN §7.2, §8.7).
 *
 * Read-only, Chief and Lead only. Every void, adjustment, reissue, status
 * change, roster edit, fallback declaration, import, station-scope bypass and
 * provisioning lands here — written inside the same transaction as the change
 * it describes, so the log is complete rather than merely usually complete.
 */
export const auditRouter: Router = Router();

export const AuditQuery = PaginationQuery.extend({
  action: z.string().trim().max(64).optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: Id.optional(),
  actorId: Id.optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
}).strict();

auditRouter.use(requireAuth);

auditRouter.get(
  '/',
  defaultRateLimit,
  requireCapability('audit.read'),
  validate({ query: AuditQuery }),
  listAuditLogHandler,
);
