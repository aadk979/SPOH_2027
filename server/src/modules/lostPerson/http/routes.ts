import { authorize } from '../../../platform/http/authorize.js';
import { theEvent, self, fromParam } from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import { Id, RaiseLostPersonRequest, ResolveLostPersonRequest } from '@spoh/shared';
import { idempotent } from '../../../platform/http/idempotency.js';
import { captureRateLimit, defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/http/access.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { validate } from '../../../platform/http/validate.js';
import { RAISE_ENDPOINT } from '../application/constants.js';
import {
  acknowledgeHandler,
  activeAlertsHandler,
  raiseAlertHandler,
  raiseReplay,
  resolveHandler,
} from './handlers.js';

/** Lost person: raise, broadcast, acknowledge, resolve (BUILD_PLAN §7.2). */
export const lostPersonRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

lostPersonRouter.use(requireAuth);

/** Any role may raise one — the person who sees it is whoever is standing there. */
lostPersonRouter.post(
  '/',
  defaultRateLimit,
  authorize('LostPerson.Raise', theEvent),
  requireCapability('lostPerson.raise'),
  validate({ body: RaiseLostPersonRequest }),
  idempotent(RAISE_ENDPOINT, { redacted: raiseReplay }),
  raiseAlertHandler,
);

/**
 * Polled by every device every 10 seconds while an alert is live, which is why
 * it sits under the capture rate limit rather than the default one.
 */
lostPersonRouter.get(
  '/active',
  captureRateLimit,
  authorize('Self.Read', self),
  requireCapability('own.read'),
  activeAlertsHandler,
);

lostPersonRouter.post(
  '/:id/ack',
  captureRateLimit,
  authorize('Alert.Ack', fromParam('LostPersonAlert')),
  requireCapability('own.read'),
  validate({ params: IdParams }),
  acknowledgeHandler,
);

lostPersonRouter.post(
  '/:id/resolve',
  defaultRateLimit,
  authorize('LostPerson.Resolve', fromParam('LostPersonAlert')),
  requireCapability('lostPerson.resolve'),
  validate({ params: IdParams, body: ResolveLostPersonRequest }),
  resolveHandler,
);
