import { Router } from 'express';
import { z } from 'zod';
import {
  CreateGroupRegistrationRequest,
  CreateRegistrationRequest,
  Id,
  RegistrationSummaryQuery,
  VoidRegistrationRequest,
} from '@spoh/shared';
import { requireCapability, requireStationScope } from '../../../platform/access/index.js';
import { captureRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import { requireAuth } from '../../../platform/identity/index.js';
import { idempotent } from '../../../platform/idempotency/index.js';
import {
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
  requireCapability('registration.create'),
  validate({ body: CreateRegistrationRequest }),
  requireStationScope(),
  idempotent('POST /registrations'),
  recordRegistrationHandler,
);

/** A family arriving together: several registrations, one Mission Card. */
registrationRouter.post(
  '/group',
  captureRateLimit,
  requireCapability('registration.create'),
  validate({ body: CreateGroupRegistrationRequest }),
  requireStationScope(),
  idempotent('POST /registrations/group'),
  recordGroupRegistrationHandler,
);

registrationRouter.post(
  '/:id/void',
  defaultRateLimit,
  requireCapability('record.void'),
  validate({ params: IdParams, body: VoidRegistrationRequest }),
  voidRegistrationHandler,
);

registrationRouter.get(
  '/summary',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: RegistrationSummaryQuery }),
  summariseRegistrationsHandler,
);
