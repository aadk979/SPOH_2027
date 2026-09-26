import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  CompleteBriefingSlotRequest,
  CreateSwapRequest,
  DecideSwapRequest,
  Id,
  ListBriefingSlotsQuery,
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
import {
  decideSwap,
  getBriefingSlots,
  getStaffingGaps,
  listMySwaps,
  listPendingSwaps,
  markSlotComplete,
  requestSwap,
} from './service.js';

/**
 * Swaps, briefing waves and staffing gaps.
 *
 * Mounted under `/roster` alongside the Phase 1 roster routes, so the whole
 * people-and-shifts surface lives at one path.
 */
export const shiftRouter: Router = Router();

const IdParams = z.object({ id: Id }).strict();

shiftRouter.use(requireAuth);

/** Any volunteer may propose a swap for their own shift; an IC decides. */
shiftRouter.post(
  '/swaps',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ body: CreateSwapRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const body = validatedBody<CreateSwapRequest>(req);
    const swap = await requestSwap(body, auth.volunteerId, auditContextFrom(req));
    res.status(201).json({ swap });
  },
);

/** My own swaps, in either direction. */
shiftRouter.get(
  '/swaps',
  defaultRateLimit,
  requireCapability('own.read'),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const swaps = await listMySwaps(auth.volunteerId);
    res.status(200).json({ data: swaps, meta: { count: swaps.length, nextCursor: null } });
  },
);

/** Everything awaiting a decision — the IC's queue. */
shiftRouter.get(
  '/swaps/pending',
  defaultRateLimit,
  requireCapability('swap.approve'),
  async (_req: Request, res: Response) => {
    const swaps = await listPendingSwaps();
    res.status(200).json({ data: swaps, meta: { count: swaps.length, nextCursor: null } });
  },
);

shiftRouter.post(
  '/swaps/:id/decide',
  defaultRateLimit,
  requireCapability('swap.approve'),
  validate({ params: IdParams, body: DecideSwapRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const body = validatedBody<DecideSwapRequest>(req);
    const swap = await decideSwap(id, body, auth.volunteerId, auditContextFrom(req));
    res.status(200).json({ swap });
  },
);

/**
 * The briefing wave roster. Readable by everyone: a volunteer who is not
 * briefing still benefits from knowing a wave of twenty is about to arrive.
 */
shiftRouter.get(
  '/briefing-slots',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ query: ListBriefingSlotsQuery }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const query = validatedQuery<ListBriefingSlotsQuery>(req);
    const slots = await getBriefingSlots(query, auth.volunteerId);
    res.status(200).json({ data: slots, meta: { count: slots.length, nextCursor: null } });
  },
);

shiftRouter.post(
  '/briefing-slots/:id/complete',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ params: IdParams, body: CompleteBriefingSlotRequest }),
  async (req: Request, res: Response) => {
    const auth = getAuth(req);
    const { id } = validatedParams<z.infer<typeof IdParams>>(req);
    const body = validatedBody<CompleteBriefingSlotRequest>(req);
    const slot = await markSlotComplete(id, body, auth.volunteerId, auditContextFrom(req));
    res.status(200).json({ slot });
  },
);

/** Which stations are understaffed right now — the Chief's redeployment view. */
shiftRouter.get(
  '/gaps',
  defaultRateLimit,
  requireCapability('dashboard.event.read'),
  async (_req: Request, res: Response) => {
    res.status(200).json(await getStaffingGaps());
  },
);
