import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import {
  self,
  fromParam,
  stationFromBody,
  anyStation,
} from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import {
  CreateGroupRegistrationRequest,
  CreateRegistrationRequest,
  Id,
  RegistrationSummaryQuery,
  VoidRegistrationRequest,
} from '@spoh/shared';
import { captureRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import {
  listCategoriesHandler,
  recordGroupRegistrationHandler,
  recordRegistrationHandler,
  summariseRegistrationsHandler,
  voidRegistrationHandler,
} from './handlers.js';

/** COUNT 1 — the sign-up booth (BUILD_PLAN §7.2). */
export const registrationRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

registrationRouter.use(requireAuth);

/**
 * One tap, one registration. The middleware order is load-bearing:
 * capability -> validate -> station scope -> idempotency -> handler.
 * Validation must precede idempotency so a malformed body is rejected before a
 * key is reserved.
 */
registrationRouter.post(
  '/',
  captureRateLimit,
  authorize('Registration.Create', stationFromBody),
  validate({ body: CreateRegistrationRequest }),
  idempotent('POST /registrations'),
  recordRegistrationHandler,
);

/** A family arriving together: several registrations, one Mission Card. */
registrationRouter.post(
  '/group',
  captureRateLimit,
  authorize('Registration.Create', stationFromBody),
  validate({ body: CreateGroupRegistrationRequest }),
  idempotent('POST /registrations/group'),
  recordGroupRegistrationHandler,
);

/** The booth's buttons: the event's categories. Any member may read them, like the stations. */
registrationRouter.get(
  '/categories',
  defaultRateLimit,
  authorize('Self.Read', self),
  listCategoriesHandler,
);

registrationRouter.post(
  '/:id/void',
  defaultRateLimit,
  authorize('Record.Void', fromParam('Registration')),
  validate({ params: IdParams, body: VoidRegistrationRequest }),
  voidRegistrationHandler,
);

registrationRouter.get(
  '/summary',
  defaultRateLimit,
  authorizeAll('Dashboard.ReadStation', anyStation('Dashboard.ReadStation'), { any: true }),
  validate({ query: RegistrationSummaryQuery }),
  summariseRegistrationsHandler,
);
