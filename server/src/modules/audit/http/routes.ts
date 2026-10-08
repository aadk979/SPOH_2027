import { authorize } from '../../../platform/http/authorize.js';
import { theEvent } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { validate } from '../../../platform/http/validate.js';
import { listAuditLogHandler } from './handlers.js';
import { AuditQuery } from './schemas.js';

/**
 * The audit log (BUILD_PLAN §7.2, §8.7).
 *
 * Read-only, Chief and Lead only. Every void, adjustment, reissue, status
 * change, roster edit, fallback declaration, import, station-scope bypass and
 * provisioning lands here — written inside the same transaction as the change
 * it describes, so the log is complete rather than merely usually complete.
 */
export const auditRouter: Router = Router();

auditRouter.use(requireAuth);

auditRouter.get(
  '/',
  defaultRateLimit,
  authorize('Audit.Read', theEvent),
  requireCapability('audit.read'),
  validate({ query: AuditQuery }),
  listAuditLogHandler,
);
