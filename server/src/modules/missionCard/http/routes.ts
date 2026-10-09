import { authorize, authorizeAll } from '../../../platform/http/authorize.js';
import {
  theEvent,
  self,
  stationFromBody,
  cardFromShortCode,
  anyStation,
} from '../../../platform/http/authorizeResources.js';
import { Router } from 'express';
import {
  CardLookupParams,
  CardFunnelQuery,
  CardQrParams,
  GenerateCardBatchRequest,
  IssueCardRequest,
  ReissueCardRequest,
  StampCardRequest,
  VoidCardRequest,
} from '@spoh/shared';
import { requireAuth } from '../../../platform/http/requireAuth.js';
import { idempotent } from '../../../platform/http/idempotency.js';
import {
  captureRateLimit,
  defaultRateLimit,
  sensitiveRateLimit,
} from '../../../platform/http/rateLimit.js';
import { validate } from '../../../platform/http/validate.js';
import {
  funnelHandler,
  generateBatchHandler,
  getCardByQrHandler,
  getCardHandler,
  issueCardHandler,
  reissueCardHandler,
  stampCardHandler,
  voidCardHandler,
} from './handlers.js';

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
  authorize('Card.GenerateBatch', theEvent),
  validate({ body: GenerateCardBatchRequest }),
  idempotent('POST /cards/batch'),
  generateBatchHandler,
);

missionCardRouter.get(
  '/funnel',
  defaultRateLimit,
  authorizeAll('Dashboard.ReadStation', anyStation('Dashboard.ReadStation'), { any: true }),
  validate({ query: CardFunnelQuery }),
  funnelHandler,
);

/** A scanned QR resolves to its card; the same people who may look a card up (F03-045). */
missionCardRouter.get(
  '/qr/:payload',
  captureRateLimit,
  authorize('Self.Read', self, { changes: ['C16'] }),
  validate({ params: CardQrParams }),
  getCardByQrHandler,
);

/** Any capture role may look a card up — this is the "where do I go next" view. */
missionCardRouter.get(
  '/:shortCode',
  captureRateLimit,
  authorize('Self.Read', self, { changes: ['C16'] }),
  validate({ params: CardLookupParams }),
  getCardHandler,
);

missionCardRouter.post(
  '/:shortCode/issue',
  captureRateLimit,
  authorizeAll('Registration.Create', anyStation('Registration.Create'), {
    changes: ['C11'],
    any: true,
  }),
  validate({ params: CardLookupParams, body: IssueCardRequest }),
  idempotent('POST /cards/:shortCode/issue'),
  issueCardHandler,
);

missionCardRouter.post(
  '/:shortCode/stamps',
  captureRateLimit,
  authorize('Card.Stamp', stationFromBody),
  validate({ params: CardLookupParams, body: StampCardRequest }),
  idempotent('POST /cards/:shortCode/stamps'),
  stampCardHandler,
);

missionCardRouter.post(
  '/:shortCode/void',
  defaultRateLimit,
  authorize('Card.Void', cardFromShortCode),
  validate({ params: CardLookupParams, body: VoidCardRequest }),
  voidCardHandler,
);

missionCardRouter.post(
  '/:shortCode/reissue',
  defaultRateLimit,
  authorize('Card.Reissue', cardFromShortCode),
  validate({ params: CardLookupParams, body: ReissueCardRequest }),
  reissueCardHandler,
);
