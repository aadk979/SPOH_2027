import { Router, type Request, type Response } from 'express';
import { DeactivatePersonRequest, Id } from '@spoh/shared';
import type { DeactivatePersonRequest as Deactivation } from '@spoh/shared';
import { z } from 'zod';
import { requirePerson, getPerson } from '../../../platform/http/requireAuth.js';
import { auditContextFrom } from '../../../platform/http/auditContext.js';
import { adminRateLimit } from '../../../platform/http/rateLimit.js';
import { validate, validatedBody, validatedParams } from '../../../platform/http/validate.js';
import {
  getPersonDetail,
  deactivatePerson,
  reactivatePerson,
} from '../application/personLifecycle.js';
import { readPersonData, erasePersonData } from '../application/personData.js';

const params = z.object({ id: Id }).strict();
export const personRouter: Router = Router();
personRouter.use(requirePerson, adminRateLimit);
const actor = (req: Request) => ({ ...getPerson(req), audit: auditContextFrom(req),
  idempotencyKey: (req.body as { idempotencyKey?: string } | undefined)?.idempotencyKey });
const id = (req: Request) => validatedParams<{ id: string }>(req).id;
personRouter.get('/:id', validate({ params }), async (req: Request, res: Response) => {
  res.json(await getPersonDetail(id(req), actor(req)));
});
personRouter.get('/:id/data', validate({ params }), async (req: Request, res: Response) => {
  res.json(await readPersonData(id(req), actor(req)));
});
personRouter.post('/:id/erase', validate({ params, body: DeactivatePersonRequest }),
  async (req: Request, res: Response) => {
    res.json(await erasePersonData(id(req), { reason: validatedBody<Deactivation>(req).reason, actor: actor(req) }));
  });
personRouter.post(
  '/:id/deactivate',
  validate({ params, body: DeactivatePersonRequest }),
  async (req: Request, res: Response) => {
    res.json(
      await deactivatePerson(id(req), {
        reason: validatedBody<Deactivation>(req).reason,
        actor: actor(req),
      }),
    );
  },
);
personRouter.post('/:id/reactivate', validate({ params }), async (req: Request, res: Response) => {
  res.json(await reactivatePerson(id(req), actor(req)));
});
