import type { IssueCardRequest, MissionCardRecord } from '@spoh/shared';
import { auditStationScopeBypass, writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { systemClock } from '../../../platform/time/index.js';
import {
  attachGroupRegistrations,
  findCardRow,
  findCardRowById,
  updateCard,
} from '../data/repo.js';
import { assertCardNotVoided, requireCard } from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { getCard } from './getCard.js';

/**
 * Issue a card at the booth.
 *
 * Idempotent in spirit as well as by key: issuing an already-issued card is a
 * no-op rather than an error, because the common cause is a volunteer scanning
 * twice, and failing there would make them think the card is broken.
 */
export async function issueCard(
  shortCodeInput: string,
  request: IssueCardRequest,
  { actor, audit, clock = systemClock }: CaptureContext,
): Promise<MissionCardRecord> {
  const shortCode = normaliseShortCode(shortCodeInput);

  const cardId = await prisma.$transaction(async (tx) => {
    const existing = requireCard(await findCardRow(tx, shortCode));
    assertCardNotVoided(existing, 'That card has been voided. Issue a fresh one.');

    if (existing.status === 'UNISSUED') {
      await updateCard(tx, existing.id, { status: 'ISSUED', issuedAt: clock.now() });
      await writeAudit(tx, {
        ...audit,
        action: 'card.issue',
        entityType: 'MissionCard',
        entityId: existing.id,
        after: { shortCode, groupId: request.groupId ?? null },
      });
    }

    // Attach the card to the group registered a moment earlier. The link is
    // optional by design: a failed link must never block the count (§2.3).
    if (request.groupId) {
      await attachGroupRegistrations(tx, { groupId: request.groupId, cardId: existing.id });
    }

    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);
    return existing.id;
  });

  const refreshed = await findCardRowById(cardId);
  if (!refreshed) throw new NotFoundError('Mission card');
  return getCard(refreshed.shortCode);
}
