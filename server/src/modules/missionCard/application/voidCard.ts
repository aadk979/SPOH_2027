import type { MissionCardRecord } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { findCardRow, updateCard } from '../data/repo.js';
import { assertCardNotVoided, requireCard } from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { getCard } from './getCard.js';

export async function voidCard(
  shortCodeInput: string,
  reason: string,
  audit: AuditContext,
): Promise<MissionCardRecord> {
  const shortCode = normaliseShortCode(shortCodeInput);

  await prisma.$transaction(async (tx) => {
    const existing = requireCard(await findCardRow(tx, shortCode));
    assertCardNotVoided(existing, 'That card is already voided.');

    await updateCard(tx, existing.id, { status: 'VOIDED', voidedAt: new Date() });
    await writeAudit(tx, {
      ...audit,
      action: 'card.void',
      entityType: 'MissionCard',
      entityId: existing.id,
      before: { status: existing.status },
      after: { status: 'VOIDED', reason },
    });
  });

  return getCard(shortCode);
}
