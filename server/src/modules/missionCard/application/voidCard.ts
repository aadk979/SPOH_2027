import type { MissionCardRecord, VoidCardRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { findCardRow, lockCard, updateCard } from '../data/repo.js';
import { assertCardNotVoided, requireCard } from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { getCardById } from './getCard.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { lockCurrentActor, requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { simpleCardReceipt } from './cardReceipt.js';
import { assertCardWritePhase } from '../domain/cardPhase.js';

export async function voidCard(
  shortCodeInput: string,
  request: VoidCardRequest,
  { scope, audit, membershipId, volunteerId, clock = systemClock }: ActorContext & { clock?: Clock },
): Promise<MissionCardRecord> {
  const shortCode = normaliseShortCode(shortCodeInput);

  const cardId = await prisma.$transaction(async (tx) => {
    assertCardWritePhase((await holdCaptureEvent(tx, scope)).status);
    const identity = { scope, membershipId, personId: volunteerId };
    await lockCurrentActor(tx, identity);
    await lockReserved(tx, scope, request.idempotencyKey);
    await lockCard(tx, scope, shortCode);
    const existing = requireCard(await findCardRow(tx, scope, shortCode));
    await requireCurrentPermission(tx, { ...identity, action: 'Card.Void',
      resource: { type: 'MissionCard', id: existing.id }, clock });
    assertCardNotVoided(existing, 'That card is already voided.');

    await updateCard(tx, scope, {
      id: existing.id,
      data: { status: 'VOIDED', voidedAt: clock.now() },
    });
    await writeAudit(tx, {
      ...audit,
      action: 'card.void',
      entityType: 'MissionCard',
      entityId: existing.id,
      before: { status: existing.status },
      after: { status: 'VOIDED', reason: request.reason },
    });
    await settleReserved(tx, scope, { key: request.idempotencyKey, statusCode: 200,
      body: simpleCardReceipt('VOID', existing) });
    return existing.id;
  });

  return getCardById(scope, cardId);
}
