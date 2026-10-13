import { z } from 'zod';
import { MissionCardRecord, StampCardResponse } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { IdempotencyKeyReuseError, InternalError, NotFoundError } from '../../../platform/errors/index.js';
import { findStationById } from '../../station/index.js';
import { cardReceipt, type CardReceipt, simpleCardReceipt, stampReceipt } from './cardReceipt.js';
import { getCardById } from './getCard.js';
import { normaliseShortCode } from '../domain/shortCode.js';

export interface CardReplayRequest {
  kind: CardReceipt['kind']; shortCode: string; stationId?: string; replacementShortCode?: string;
}

/** Historical issue/stamp snapshots are identified, then hydrated without copying their names. */
function legacyReceipt(stored: unknown, request: CardReplayRequest): CardReceipt {
  if (request.kind === 'ISSUE') {
    const legacy = z.object({ card: MissionCardRecord }).strict().safeParse(stored);
    if (legacy.success) return simpleCardReceipt('ISSUE', legacy.data.card);
  }
  if (request.kind === 'STAMP') {
    const legacy = StampCardResponse.safeParse(stored);
    if (legacy.success && request.stationId &&
      legacy.data.card.stamps.some((stamp) => stamp.stationId === request.stationId))
      return stampReceipt({ cardId: legacy.data.card.id, shortCode: legacy.data.card.shortCode,
        stationId: request.stationId, stampAdded: legacy.data.stampAdded,
        justCompleted: legacy.data.justCompleted });
  }
  throw new InternalError('The saved card response could not be loaded.');
}

function assertReceiptTarget(receipt: CardReceipt, request: CardReplayRequest): void {
  const code = normaliseShortCode(request.shortCode);
  if (receipt.kind !== request.kind ||
    (receipt.kind === 'REISSUE' ? receipt.originalShortCode : receipt.shortCode) !== code)
    throw new IdempotencyKeyReuseError();
  if (receipt.kind === 'STAMP' && receipt.stationId !== request.stationId)
    throw new IdempotencyKeyReuseError();
  if (receipt.kind === 'REISSUE' && receipt.shortCode !== normaliseShortCode(request.replacementShortCode ?? ''))
    throw new IdempotencyKeyReuseError();
}

/** Finished effects are never re-admitted, re-authorized as mutations, or written again. */
export async function replayCard(
  scope: EventScope, stored: unknown, request: CardReplayRequest,
): Promise<unknown> {
  const parsed = cardReceipt.safeParse(stored);
  const receipt = parsed.success ? parsed.data : legacyReceipt(stored, request);
  assertReceiptTarget(receipt, request);
  const card = await getCardById(scope, receipt.cardId);
  if (receipt.kind === 'STAMP') {
    let warning: string | null = null;
    if (receipt.warningKind) {
      const station = await findStationById(scope, receipt.stationId);
      if (!station) throw new NotFoundError('Station');
      warning = `This card was already stamped at ${station.name}.`;
    }
    return { card, stampAdded: receipt.stampAdded, justCompleted: receipt.justCompleted, warning };
  }
  if (receipt.kind === 'REISSUE')
    return { card, voidedCardId: receipt.voidedCardId, stampsCarriedOver: receipt.stampsCarriedOver };
  return { card };
}
