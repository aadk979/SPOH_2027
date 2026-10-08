import { authorize } from '../../../platform/http/authorize.js';
import { self, fromBody } from '../../../platform/http/authorizeResources.js';
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

meRouter.get(
  '/',
  defaultRateLimit,
  authorize('Self.Read', self),
  requireCapability('own.read'),
  getMeHandler,
);

meRouter.post(
  '/check-in',
  defaultRateLimit,
  authorize('Shift.CheckIn', fromBody('ShiftAssignment', 'assignmentId'), { changes: ['C12'] }),
  requireCapability('own.read'),
  validate({ body: CheckInRequest }),
  checkInHandler,
);

meRouter.post(
  '/check-out',
  defaultRateLimit,
  // Leaving a shift needs no attendance or running shift; the use case checks it is yours.
  authorize('Self.Read', self, { changes: ['C12'] }),
  requireCapability('own.read'),
  validate({ body: CheckInRequest }),
  checkOutHandler,
);
