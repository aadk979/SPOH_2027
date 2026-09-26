import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ClaimLostFoundRequest,
  CreateLostFoundRequest,
  Id,
  ListLostFoundQuery,
} from '@spoh/shared';
import { getAuth, requireAuth } from '../../platform/identity/index.js';
import { defaultRateLimit } from '../../platform/http/rateLimit.js';
import { requireCapability } from '../../platform/access/index.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../platform/http/validate.js';
import { auditContextFrom } from '../../platform/http/auditContext.js';
import { claimItem, listItems, logItem, markUnclaimedAtClose } from './service.js';

/** Lost and found (BUILD_PLAN §7.2). */
export const lostFoundRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

lostFoundRouter.use(requireAuth);

/** Any volunteer can log an item — whoever finds it is whoever is standing there. */
lostFoundRouter.post(
  '/',
  defaultRateLimit,
  requireCapability('lostFound.log'),
  validate({ body: CreateLostFoundRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const body = validatedBody<CreateLostFoundRequest>(req);
    const item = await logItem(body, auth.volunteerId, auditContextFrom(req));
    res.status(201).json({ item });
  },
);

/**
 * Searchable by everyone. A visitor asking about a lost bottle will ask
 * whichever volunteer they happen to be standing next to.
 */
lostFoundRouter.get(
  '/',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ query: ListLostFoundQuery }),
  async (req: Request, res: Response) => {
    const items = await listItems(validatedQuery<ListLostFoundQuery>(req));
    res.status(200).json({
      data: items,
      meta: { count: items.length, nextCursor: items.at(-1)?.id ?? null },
    });
  },
);

lostFoundRouter.post(
  '/:id/claim',
  defaultRateLimit,
  requireCapability('lostFound.log'),
  validate({ params: IdParams, body: ClaimLostFoundRequest }),
  async (req: Request, res: Response) => {
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const body = validatedBody<ClaimLostFoundRequest>(req);
    res.status(200).json({ item: await claimItem(id, body, auditContextFrom(req)) });
  },
);

/** End-of-event close-out, so every case has an outcome in the report. */
lostFoundRouter.post(
  '/close-out',
  defaultRateLimit,
  requireCapability('report.generate'),
  async (req: Request, res: Response) => {
    const count = await markUnclaimedAtClose(auditContextFrom(req));
    res.status(200).json({ markedUnclaimed: count });
  },
);
