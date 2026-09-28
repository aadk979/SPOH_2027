import { Router } from 'express';
import { CheckInRequest } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { requireCapability } from '../../../platform/http/access.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { checkInHandler, checkOutHandler, getMeHandler } from './handlers.js';

/** Caller profile and shift attendance (BUILD_PLAN §7.2). */
export const meRouter: Router = Router();

meRouter.use(requireAuth);

meRouter.get('/', defaultRateLimit, requireCapability('own.read'), getMeHandler);

meRouter.post(
  '/check-in',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ body: CheckInRequest }),
  checkInHandler,
);

meRouter.post(
  '/check-out',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ body: CheckInRequest }),
  checkOutHandler,
);
