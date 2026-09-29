import type { StampCardRequest, StampCardResponse } from '@spoh/shared';
import { auditStationScopeBypass, writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { systemClock } from '../../../platform/time/index.js';
import { requireActiveStation } from '../../station/index.js';
import {
  countStampsForCard,
  createStamp,
  findCardWithStampStations,
  lockCard,
  updateCard,
} from '../data/repo.js';
import {
  assertCardNotVoided,
  assertStationStamps,
  isJourneyComplete,
  requireCard,
} from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { getCard } from './getCard.js';
import { stampingStationIds } from './stampingStations.js';

interface StampInput {
  shortCode: string;
  station: { id: string; name: string };
  stationCount: number;
  request: StampCardRequest;
  context: CaptureContext;
  recordedAt: Date;
}

interface StampOutcome {
  stampAdded: boolean;
  justCompleted: boolean;
  warning: string | null;
}

/**
 * Record the stamp inside the transaction, completing the card if this was
 * its last station.
 */
async function applyStamp(tx: PrismaTransactionClient, input: StampInput): Promise<StampOutcome> {
  const { station, recordedAt, context } = input;
  const { scope } = context;
  await lockCard(tx, scope, input.shortCode);
  const existing = requireCard(await findCardWithStampStations(tx, scope, input.shortCode));
  assertCardNotVoided(existing, 'That card has been voided.');

  if (existing.stampEvents.some((stamp) => stamp.stationId === station.id)) {
    const warning = `This card was already stamped at ${station.name}.`;
    return { stampAdded: false, justCompleted: false, warning };
  }

  // A card scanned at a station before the booth issued it was handed out
  // without being linked. Record the stamp anyway and mark it issued: losing
  // the journey would be worse than a slightly late issue timestamp.
  if (existing.status === 'UNISSUED') {
    await updateCard(tx, scope, {
      id: existing.id,
      data: { status: 'ISSUED', issuedAt: recordedAt },
    });
  }

  await createStamp(tx, scope, {
    missionCardId: existing.id,
    stationId: station.id,
    recordedById: context.actor.volunteerId,
    recordedByMembershipId: context.actor.membershipId,
    recordedAt,
    clientRecordedAt: input.request.clientRecordedAt
      ? new Date(input.request.clientRecordedAt)
      : null,
    idempotencyKey: input.request.idempotencyKey,
    source: 'APP',
  });

  const stampCount = await countStampsForCard(tx, scope, existing.id);
  const justCompleted = isJourneyComplete(stampCount, input.stationCount);
  if (justCompleted && existing.status !== 'COMPLETED') {
    await updateCard(tx, scope, {
      id: existing.id,
      data: { status: 'COMPLETED', completedAt: recordedAt },
    });
  }

  await auditStationScopeBypass(tx, context.actor.stationScopeBypass, context.audit);
  await writeAudit(tx, {
    ...context.audit,
    action: 'card.stamp',
    entityType: 'MissionCard',
    entityId: existing.id,
    after: { stationId: station.id, stampCount, completed: justCompleted },
  });

  return { stampAdded: true, justCompleted, warning: null };
}

/**
 * Stamp a card at a station.
 *
 * A second scan at the same station warns rather than blocking — a re-scan
 * after a correction is legitimate (PRODUCT_BRIEF §12) — but no second row is
 * written. A journey is the set of stations visited, not a tally of scans, and
 * the unique constraint on (card, station) says so.
 */
export async function stampCard(
  shortCodeInput: string,
  request: StampCardRequest,
  context: CaptureContext,
): Promise<StampCardResponse> {
  const shortCode = normaliseShortCode(shortCodeInput);
  const station = await requireActiveStation(context.scope, request.stationId);
  assertStationStamps({ name: station.name, issuesStamp: station.type?.issuesStamp ?? false });

  const stationCount = (await stampingStationIds(context.scope)).length;
  const recordedAt = (context.clock ?? systemClock).now();

  const outcome = await prisma.$transaction((tx) =>
    applyStamp(tx, { shortCode, station, stationCount, request, context, recordedAt }),
  );

  return { card: await getCard(context.scope, shortCode), ...outcome };
}
