import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Id, RaiseLostPersonRequest, ResolveLostPersonRequest } from '@spoh/shared';
import { getAuth, requireAuth } from '../../middleware/auth/index.js';
import { idempotent } from '../../middleware/idempotency.js';
import { captureRateLimit, defaultRateLimit } from '../../middleware/rateLimit.js';
import { requireCapability } from '../../middleware/rbac.js';
import { validate, validatedBody, validatedParams } from '../../middleware/validate.js';
import { auditContextFrom } from '../../lib/requestContext.js';
import {
  acknowledge,
  getActiveAlerts,
  getAlert,
  raiseAlert,
  RAISE_ENDPOINT,
  resolve,
} from './service.js';

/** Lost person: raise, broadcast, acknowledge, resolve (BUILD_PLAN §7.2). */
export const lostPersonRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

/**
 * The create response describes a person, so its replay copy holds only the
 * alert id and a retry re-reads the alert (F04-013). A replay after the purge
 * returns the alert without its description, as every other read does.
 */
const raiseReplay = {
  store: (body: unknown) => ({ alertId: (body as { alert: { id: string } }).alert.id }),
  replay: async (req: Request, stored: unknown) => {
    const { alertId } = stored as { alertId: string };
    return { alert: await getAlert(alertId, getAuth(req).volunteerId) };
  },
};

lostPersonRouter.use(requireAuth);

/** Any role may raise one — the person who sees it is whoever is standing there. */
lostPersonRouter.post(
  '/',
  defaultRateLimit,
  requireCapability('lostPerson.raise'),
  validate({ body: RaiseLostPersonRequest }),
  idempotent(RAISE_ENDPOINT, { redacted: raiseReplay }),
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
