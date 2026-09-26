import { Router, type Request, type Response } from 'express';
import {
  CardLookupParams,
  GenerateCardBatchRequest,
  IssueCardRequest,
  ReissueCardRequest,
  StampCardRequest,
  TimeRangeQuery,
  VoidCardRequest,
} from '@spoh/shared';
import { requireAuth } from '../../platform/identity/index.js';
import { idempotent } from '../../platform/idempotency/index.js';
import {
  captureRateLimit,
  defaultRateLimit,
  sensitiveRateLimit,
} from '../../platform/http/rateLimit.js';
import { requireCapability, requireStationScope } from '../../platform/access/index.js';
import {
  validate,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../platform/http/validate.js';
import { captureActorFrom } from '../../platform/http/captureActor.js';
import { auditContextFrom } from '../../platform/http/auditContext.js';
import {
  generateBatch,
  getCard,
  getFunnel,
  issueCard,
  reissueCard,
  stampCard,
  voidCard,
} from './service.js';

/** COUNT 3 — Mission Cards (BUILD_PLAN §7.2). */
export const missionCardRouter: Router = Router();

missionCardRouter.use(requireAuth);

/**
 * Batch generation, mounted before `/:shortCode` so "batch" is not parsed as a
 * card code. Admin-and-Chief only, and rate limited hard: it writes thousands
 * of rows and produces the file that goes to the printer.
 */
missionCardRouter.post(
  '/batch',
  sensitiveRateLimit,
  requireCapability('user.provision'),
  validate({ body: GenerateCardBatchRequest }),
  async (req: Request, res: Response) => {
    const body = validatedBody<GenerateCardBatchRequest>(req);
    res.status(201).json(await generateBatch(body, auditContextFrom(req)));
  },
);

missionCardRouter.get(
  '/funnel',
  defaultRateLimit,
  requireCapability('dashboard.station.read'),
  validate({ query: TimeRangeQuery }),
  async (req: Request, res: Response) => {
    res.status(200).json(await getFunnel(validatedQuery<TimeRangeQuery>(req)));
  },
);

/** Any capture role may look a card up — this is the "where do I go next" view. */
missionCardRouter.get(
  '/:shortCode',
  captureRateLimit,
  requireCapability('card.stamp'),
  validate({ params: CardLookupParams }),
  async (req: Request, res: Response) => {
    const { shortCode } = validatedParams<CardLookupParams>(req);
    res.status(200).json({ card: await getCard(shortCode) });
  },
);

missionCardRouter.post(
  '/:shortCode/issue',
  captureRateLimit,
  requireCapability('registration.create'),
  validate({ params: CardLookupParams, body: IssueCardRequest }),
  idempotent('POST /cards/:shortCode/issue'),
  async (req: Request, res: Response) => {
    const { shortCode } = validatedParams<CardLookupParams>(req);
    const body = validatedBody<IssueCardRequest>(req);
    const card = await issueCard(shortCode, body, captureActorFrom(req), auditContextFrom(req));
    res.status(200).json({ card });
  },
);

missionCardRouter.post(
  '/:shortCode/stamps',
  captureRateLimit,
  requireCapability('card.stamp'),
  validate({ params: CardLookupParams, body: StampCardRequest }),
  requireStationScope(),
  idempotent('POST /cards/:shortCode/stamps'),
  async (req: Request, res: Response) => {
    const { shortCode } = validatedParams<CardLookupParams>(req);
    const body = validatedBody<StampCardRequest>(req);
    const result = await stampCard(shortCode, body, captureActorFrom(req), auditContextFrom(req));
    // 200 rather than 201 when nothing new was written: the station had already
    // stamped this card, and the response is a warning, not a creation.
    res.status(result.stampAdded ? 201 : 200).json(result);
  },
);

missionCardRouter.post(
  '/:shortCode/void',
  defaultRateLimit,
  requireCapability('card.reissue'),
  validate({ params: CardLookupParams, body: VoidCardRequest }),
  async (req: Request, res: Response) => {
    const { shortCode } = validatedParams<CardLookupParams>(req);
    const { reason } = validatedBody<VoidCardRequest>(req);
    res.status(200).json({ card: await voidCard(shortCode, reason, auditContextFrom(req)) });
  },
);

missionCardRouter.post(
  '/:shortCode/reissue',
  defaultRateLimit,
  requireCapability('card.reissue'),
  validate({ params: CardLookupParams, body: ReissueCardRequest }),
  async (req: Request, res: Response) => {
    const { shortCode } = validatedParams<CardLookupParams>(req);
    const body = validatedBody<ReissueCardRequest>(req);
    res.status(201).json(await reissueCard(shortCode, body, auditContextFrom(req)));
  },
);
