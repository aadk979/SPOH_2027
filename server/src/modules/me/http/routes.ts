import { authorize } from '../../../platform/http/authorize.js';
import { self, fromBody } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { CheckInRequest } from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { checkInHandler, checkOutHandler, getMeHandler } from './handlers.js';
import { myPermissionsHandler } from './permissionsHandler.js';

/** Caller profile and shift attendance (BUILD_PLAN §7.2). */
export const meRouter: Router = Router();

meRouter.use(requireAuth);

meRouter.get('/', defaultRateLimit, authorize('Self.Read', self), getMeHandler);

/** What the caller may do here, for the screens (P11.8): the local engine answers. */
meRouter.get('/permissions', defaultRateLimit, authorize('Self.Read', self), myPermissionsHandler);

meRouter.post(
  '/check-in',
  defaultRateLimit,
  authorize('Shift.CheckIn', fromBody('ShiftAssignment', 'assignmentId'), { changes: ['C12'] }),
  validate({ body: CheckInRequest }),
  checkInHandler,
);

meRouter.post(
  '/check-out',
  defaultRateLimit,
  // Leaving a shift needs no attendance or running shift; the use case checks it is yours.
  authorize('Self.Read', self, { changes: ['C12'] }),
  validate({ body: CheckInRequest }),
  checkOutHandler,
);
