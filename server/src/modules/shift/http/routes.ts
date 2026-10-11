import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import {
  theEvent,
  self,
  fromParam,
  fromBody,
  anyPendingSwap,
} from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import { z } from 'zod';
import {
  CompleteBriefingSlotRequest,
  CreateBriefingSlotRequest,
  CreateSwapRequest,
  DecideSwapRequest,
  Id,
  ListBriefingSlotsQuery,
  WithdrawSwapRequest,
} from '@spoh/shared';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { validate } from '../../../platform/http/validate.js';
import {
  briefingSlotsHandler,
  completeSlotHandler,
  decideSwapHandler,
  mySwapsHandler,
  pendingSwapsHandler,
  requestSwapHandler,
  staffingGapsHandler,
  scheduleBriefingHandler,
  swapTargetsHandler,
  withdrawSwapHandler,
} from './handlers.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import { optionalIdempotent } from '../../../platform/http/optionalIdempotency.js';
import { briefingMutationReplay, swapMutationReplay } from './replay.js';

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
  authorize('Swap.Request', fromBody('ShiftAssignment', 'assignmentId'), { changes: ['C12'] }),
  validate({ body: CreateSwapRequest }),
  optionalIdempotent('swap.request', swapMutationReplay),
  requestSwapHandler,
);

/** My own swaps, in either direction. */
shiftRouter.get('/swaps', defaultRateLimit, authorize('Self.Read', self), mySwapsHandler);
shiftRouter.post(
  '/swaps/:id/withdraw',
  defaultRateLimit,
  authorize('Self.Read', self),
  validate({ params: IdParams, body: WithdrawSwapRequest }),
  idempotent('swap.withdraw'),
  withdrawSwapHandler,
);
shiftRouter.get(
  '/swap-targets',
  defaultRateLimit,
  authorize('Self.Read', self),
  swapTargetsHandler,
);

/** Everything awaiting a decision — the IC's queue. */
shiftRouter.get(
  '/swaps/pending',
  defaultRateLimit,
  authorizeAll('Swap.Decide', anyPendingSwap, { any: true }),
  pendingSwapsHandler,
);

shiftRouter.post(
  '/swaps/:id/decide',
  defaultRateLimit,
  authorize('Swap.Decide', fromParam('SwapRequest')),
  validate({ params: IdParams, body: DecideSwapRequest }),
  optionalIdempotent('swap.decide', swapMutationReplay),
  decideSwapHandler,
);

/**
 * The briefing wave roster. Readable by everyone: a volunteer who is not
 * briefing still benefits from knowing a wave of twenty is about to arrive.
 */
shiftRouter.get(
  '/briefing-slots',
  defaultRateLimit,
  authorize('Self.Read', self),
  validate({ query: ListBriefingSlotsQuery }),
  briefingSlotsHandler,
);

shiftRouter.post(
  '/briefing-slots',
  defaultRateLimit,
  authorize('Roster.Edit', theEvent),
  validate({ body: CreateBriefingSlotRequest }),
  idempotent('briefing.schedule'),
  scheduleBriefingHandler,
);

shiftRouter.post(
  '/briefing-slots/:id/complete',
  defaultRateLimit,
  authorize('Briefing.Complete', fromParam('BriefingSlot'), { changes: ['C1'] }),
  validate({ params: IdParams, body: CompleteBriefingSlotRequest }),
  optionalIdempotent('briefing.complete', briefingMutationReplay),
  completeSlotHandler,
);

/** Which stations are understaffed right now — the Chief's redeployment view. */
shiftRouter.get(
  '/gaps',
  defaultRateLimit,
  authorize('Dashboard.ReadEvent', theEvent),
  staffingGapsHandler,
);
