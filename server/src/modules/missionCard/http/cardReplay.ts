import { z } from 'zod';
import { MissionCardRecord, ReissueCardResponse, StampCardResponse,
  type CardLookupParams, type ReissueCardRequest, type StampCardRequest } from '@spoh/shared';
import type { Request } from 'express';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { type CardReceipt, reissueReceipt, simpleCardReceipt, stampReceipt } from '../application/cardReceipt.js';
import { replayCard, type CardReplayRequest } from '../application/replayCard.js';

function replayRequest(kind: CardReceipt['kind'], req: Request): CardReplayRequest {
  const shortCode = validatedParams<CardLookupParams>(req).shortCode;
  if (kind === 'STAMP') return { kind, shortCode, stationId: validatedBody<StampCardRequest>(req).stationId };
  if (kind === 'REISSUE') return { kind, shortCode,
    replacementShortCode: validatedBody<ReissueCardRequest>(req).replacementShortCode };
  return { kind, shortCode };
}

function storedReceipt(kind: CardReceipt['kind'], body: unknown, req: Request): CardReceipt {
  if (kind === 'STAMP') {
    const response = StampCardResponse.parse(body);
    return stampReceipt({ cardId: response.card.id, shortCode: response.card.shortCode,
      stationId: validatedBody<StampCardRequest>(req).stationId,
      stampAdded: response.stampAdded, justCompleted: response.justCompleted });
  }
  if (kind === 'REISSUE') {
    const response = ReissueCardResponse.parse(body);
    return reissueReceipt({ cardId: response.card.id, shortCode: response.card.shortCode,
      originalShortCode: validatedParams<CardLookupParams>(req).shortCode,
      voidedCardId: response.voidedCardId, stampsCarriedOver: response.stampsCarriedOver });
  }
  return simpleCardReceipt(kind, z.object({ card: MissionCardRecord }).strict().parse(body).card);
}

export function cardReplay(kind: CardReceipt['kind']): RedactedReplay {
  return {
    store: (body, req) => storedReceipt(kind, body, req),
    replay: (req, stored) => replayCard(scopeOf(req), stored, replayRequest(kind, req)),
  };
}
