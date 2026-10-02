import type { MissionCardRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { findCardRow, updateCard } from '../data/repo.js';
import { assertCardNotVoided, requireCard } from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { getCard } from './getCard.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';

export async function voidCard(
  shortCodeInput: string,
  reason: string,
  { scope, audit, clock = systemClock }: ActorContext & { clock?: Clock },
): Promise<MissionCardRecord> {
  const shortCode = normaliseShortCode(shortCodeInput);

  await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, scope);
    const existing = requireCard(await findCardRow(tx, scope, shortCode));
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
      after: { status: 'VOIDED', reason },
    });
  });

  return getCard(scope, shortCode);
}
