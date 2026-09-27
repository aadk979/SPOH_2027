import { Router } from 'express';
import { z } from 'zod';
import {
  CompleteBriefingSlotRequest,
  CreateSwapRequest,
  DecideSwapRequest,
  Id,
  ListBriefingSlotsQuery,
} from '@spoh/shared';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireCapability } from '../../../platform/access/index.js';
import { requireAuth } from '../../../platform/identity/index.js';
import { validate } from '../../../platform/http/validate.js';
import {
  briefingSlotsHandler,
  completeSlotHandler,
  decideSwapHandler,
  mySwapsHandler,
  pendingSwapsHandler,
  requestSwapHandler,
  staffingGapsHandler,
} from './handlers.js';

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
  requestSwapHandler,
);

/** My own swaps, in either direction. */
shiftRouter.get('/swaps', defaultRateLimit, requireCapability('own.read'), mySwapsHandler);

/** Everything awaiting a decision — the IC's queue. */
shiftRouter.get(
  '/swaps/pending',
  defaultRateLimit,
  requireCapability('swap.approve'),
  pendingSwapsHandler,
);

shiftRouter.post(
  '/swaps/:id/decide',
  defaultRateLimit,
  requireCapability('swap.approve'),
  validate({ params: IdParams, body: DecideSwapRequest }),
  decideSwapHandler,
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
  briefingSlotsHandler,
);

shiftRouter.post(
  '/briefing-slots/:id/complete',
  defaultRateLimit,
  requireCapability('own.read'),
  validate({ params: IdParams, body: CompleteBriefingSlotRequest }),
  completeSlotHandler,
);

/** Which stations are understaffed right now — the Chief's redeployment view. */
shiftRouter.get(
  '/gaps',
  defaultRateLimit,
  requireCapability('dashboard.event.read'),
  staffingGapsHandler,
);
