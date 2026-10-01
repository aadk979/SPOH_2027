import { Router } from 'express';
import { VisitorRecordsQuery } from '@spoh/shared';
import { requireCapability } from '../../../platform/http/access.js';
import { sensitiveRateLimit } from '../../../platform/http/rateLimit.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { validate } from '../../../platform/http/validate.js';
import { readVisitorRecordsHandler } from './handlers.js';

/**
 * Reading visitor values (ADR-002 §4). Any member may ask; each field's
 * reader roles decide what comes back, and a role that reads none is refused.
 */
export const visitorRouter: Router = Router();

visitorRouter.use(requireAuth);

visitorRouter.get(
  '/',
  sensitiveRateLimit,
  requireCapability('own.read'),
  validate({ query: VisitorRecordsQuery }),
  readVisitorRecordsHandler,
);
