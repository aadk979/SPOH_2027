import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Id, RaiseLostPersonRequest, ResolveLostPersonRequest } from '@spoh/shared';
import { getAuth, requireAuth } from '../../middleware/auth/index.js';
import { idempotent } from '../../middleware/idempotency.js';
import { captureRateLimit, defaultRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability } from '../../middleware/rbac.js';
import { validate, validatedBody, validatedParams } from '../../middleware/validate.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import { acknowledge, getActiveAlerts, raiseAlert, resolve } from './service.js';

/** Lost person: raise, broadcast, acknowledge, resolve (BUILD_PLAN §7.2). */
export const lostPersonRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

lostPersonRouter.use(requireAuth);

/** Any role may raise one — the person who sees it is whoever is standing there. */
lostPersonRouter.post(
  '/',
  defaultRateLimit,
  requireCapability('lostPerson.raise'),
  validate({ body: RaiseLostPersonRequest }),
  idempotent('POST /lost-person'),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const body = validatedBody<RaiseLostPersonRequest>(req);
    const alert = await raiseAlert(body, auth.volunteerId, auditContextFrom(req));
    res.status(201).json({ alert });
  },
);

/**
 * Polled by every device every 10 seconds while an alert is live, which is why
 * it sits under the capture rate limit rather than the default one.
 */
lostPersonRouter.get(
  '/active',
  captureRateLimit,
  requireCapability('own.read'),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    res.status(200).json(await getActiveAlerts(auth.volunteerId));
  },
);

lostPersonRouter.post(
  '/:id/ack',
  captureRateLimit,
  requireCapability('own.read'),
  validate({ params: IdParams }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const alert = await acknowledge(id, auth.volunteerId);
    res.status(200).json({ alert });
  },
);

lostPersonRouter.post(
  '/:id/resolve',
  defaultRateLimit,
  requireCapability('lostPerson.resolve'),
  validate({ params: IdParams, body: ResolveLostPersonRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const body = validatedBody<ResolveLostPersonRequest>(req);
    const alert = await resolve(id, body, auditContextFrom(req));
    res.status(200).json({ alert });
  },
);
