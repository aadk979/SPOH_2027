import { Router } from 'express';
import { CheckInRequest } from '@spoh/shared';
import { requireAuth } from '../../../platform/identity/index.js';
import { requireCapability } from '../../../platform/access/index.js';
import { validate } from '../../../platform/http/validate.js';
import { checkInHandler, checkOutHandler, getMeHandler } from './handlers.js';

/** Caller profile and shift attendance (BUILD_PLAN §7.2). */
export const meRouter: Router = Router();

meRouter.use(requireAuth);

meRouter.get('/', requireCapability('own.read'), getMeHandler);

meRouter.post(
  '/check-in',
  requireCapability('own.read'),
  validate({ body: CheckInRequest }),
  checkInHandler,
);

meRouter.post(
  '/check-out',
  requireCapability('own.read'),
  validate({ body: CheckInRequest }),
  checkOutHandler,
);
