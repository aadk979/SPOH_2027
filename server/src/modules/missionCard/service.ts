import {
  ERROR_CODES,
  type CardFunnelResponse,
  type GenerateCardBatchRequest,
  type GenerateCardBatchResponse,
  type IssueCardRequest,
  type MissionCardRecord,
  type ReissueCardRequest,
  type ReissueCardResponse,
  type StampCardRequest,
  type StampCardResponse,
} from '@spoh/shared';
import {
  auditStationScopeBypass,
  writeAudit,
  type AuditContext,
} from '../../platform/audit/index.js';
import type { CaptureActor } from '../../platform/http/captureActor.js';
import { AppError, NotFoundError } from '../../platform/errors/index.js';
import { prisma } from '../../platform/db/client.js';
import { generateQrPayload, generateShortCode, normaliseShortCode } from './shortCode.js';
import { rangeOverlapsFallbackWindow } from '../fallback/repo.js';
import { listStampingStations } from '../station/data/repo.js';
import { requireActiveStation } from '../station/application/stationGuards.js';
import {
  countByStatus,
  countCardsPerStation,
  countIssued,
  countRedeemedCards,
  countStampsForCard,
  countVoided,
  createCardBatch,
  createStamp,
  findCardByShortCode,
  toMissionCardRecord,
  updateCard,
  type CardWithContext,
} from './repo.js';

/**
 * COUNT 3 — Mission Cards (PRODUCT_BRIEF §4).
 *
 * The physical card is not replaced. It is a keepsake, the character stamps are
 * the point, and it works when nothing else does. This service MIRRORS the
 * card; it does not replace it. At redemption the physical stamps are still
 * verified visually and the scan is a cross-check, never a gate.
 */

/** A card is complete when it has been stamped at every stamping station. */
async function stampingStationIds(): Promise<string[]> {
  const stations = await listStampingStations();
  return stations.map((station) => station.id);
}

export async function getCard(shortCodeInput: string): Promise<MissionCardRecord> {
  const card = await findCardByShortCode(normaliseShortCode(shortCodeInput));
  if (!card) throw new AppError(404, ERROR_CODES.CARD_NOT_FOUND, 'No card with that code');

  return toMissionCardRecord(card, await stampingStationIds());
}

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
  actor: CaptureActor,
  audit: AuditContext,
): Promise<MissionCardRecord> {
  const shortCode = normaliseShortCode(shortCodeInput);

  const card = await prisma.$transaction(async (tx) => {
    const existing = await tx.missionCard.findUnique({ where: { shortCode } });
    if (!existing) throw new AppError(404, ERROR_CODES.CARD_NOT_FOUND, 'No card with that code');

    if (existing.status === 'VOIDED') {
      throw new AppError(
        409,
        ERROR_CODES.CARD_VOIDED,
        'That card has been voided. Issue a fresh one.',
      );
    }

    if (existing.status === 'UNISSUED') {
      await updateCard(tx, existing.id, { status: 'ISSUED', issuedAt: new Date() });

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
      await tx.registration.updateMany({
        where: { groupId: request.groupId, missionCardId: null },
        data: { missionCardId: existing.id },
      });
    }

    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);

    return existing.id;
  });

  const refreshed = await prisma.missionCard.findUnique({ where: { id: card } });
  if (!refreshed) throw new NotFoundError('Mission card');

  return getCard(refreshed.shortCode);
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
  actor: CaptureActor,
  audit: AuditContext,
): Promise<StampCardResponse> {
  const shortCode = normaliseShortCode(shortCodeInput);
  const station = await requireActiveStation(request.stationId);

  if (!station.issuesStamp) {
    throw new AppError(
      409,
      ERROR_CODES.STATION_DOES_NOT_STAMP,
      `${station.name} does not stamp Mission Cards.`,
    );
  }

  const stampStations = await stampingStationIds();
  const recordedAt = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.missionCard.findUnique({
      where: { shortCode },
      include: { stampEvents: { select: { stationId: true } } },
    });

    if (!existing) throw new AppError(404, ERROR_CODES.CARD_NOT_FOUND, 'No card with that code');

    if (existing.status === 'VOIDED') {
      throw new AppError(409, ERROR_CODES.CARD_VOIDED, 'That card has been voided.');
    }

    const alreadyStamped = existing.stampEvents.some((s) => s.stationId === station.id);

    if (alreadyStamped) {
      return {
        cardId: existing.id,
        stampAdded: false,
        justCompleted: false,
        warning: `This card was already stamped at ${station.name}.`,
      };
    }

    /**
     * A card scanned at a station before the booth ever issued it is a card
     * that was handed out without being linked. Record the stamp anyway and
     * mark it issued: losing the journey data would be worse than a slightly
     * late issue timestamp, and the visitor is plainly here.
     */
    if (existing.status === 'UNISSUED') {
      await updateCard(tx, existing.id, { status: 'ISSUED', issuedAt: recordedAt });
    }

    await createStamp(tx, {
      missionCardId: existing.id,
      stationId: station.id,
      recordedById: actor.volunteerId,
      recordedAt,
      clientRecordedAt: request.clientRecordedAt ? new Date(request.clientRecordedAt) : null,
      idempotencyKey: request.idempotencyKey,
      source: 'APP',
    });

    const stampCount = await countStampsForCard(tx, existing.id);
    const justCompleted = stampStations.length > 0 && stampCount >= stampStations.length;

    if (justCompleted && existing.status !== 'COMPLETED') {
      await updateCard(tx, existing.id, { status: 'COMPLETED', completedAt: recordedAt });
    }

    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);

    await writeAudit(tx, {
      ...audit,
      action: 'card.stamp',
      entityType: 'MissionCard',
      entityId: existing.id,
      after: { stationId: station.id, stampCount, completed: justCompleted },
    });

    return { cardId: existing.id, stampAdded: true, justCompleted, warning: null as string | null };
  });

  return {
    card: await getCard(shortCode),
    stampAdded: outcome.stampAdded,
    justCompleted: outcome.justCompleted,
    warning: outcome.warning,
  };
}

export async function voidCard(
  shortCodeInput: string,
  reason: string,
  audit: AuditContext,
): Promise<MissionCardRecord> {
  const shortCode = normaliseShortCode(shortCodeInput);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.missionCard.findUnique({ where: { shortCode } });
    if (!existing) throw new AppError(404, ERROR_CODES.CARD_NOT_FOUND, 'No card with that code');

    if (existing.status === 'VOIDED') {
      throw new AppError(409, ERROR_CODES.CARD_VOIDED, 'That card is already voided.');
    }

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

/**
 * Reissue against a lost card (PRODUCT_BRIEF §4.3).
 *
 * The stamps are carried over so the visitor does not have to walk the journey
 * again, and the original is voided in the same transaction so one journey can
 * never be redeemed twice. IC-level, because it moves a journey between two
 * physical objects.
 */
export async function reissueCard(
  shortCodeInput: string,
  request: ReissueCardRequest,
  audit: AuditContext,
): Promise<ReissueCardResponse> {
  const originalCode = normaliseShortCode(shortCodeInput);
  const replacementCode = normaliseShortCode(request.replacementShortCode);

  if (originalCode === replacementCode) {
    throw new AppError(409, ERROR_CODES.CONFLICT, 'The replacement must be a different card.');
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const original = await tx.missionCard.findUnique({
      where: { shortCode: originalCode },
      include: { stampEvents: true },
    });
    if (!original) {
      throw new AppError(404, ERROR_CODES.CARD_NOT_FOUND, 'No card with that code');
    }

    const replacement = await tx.missionCard.findUnique({
      where: { shortCode: replacementCode },
    });
    if (!replacement) {
      throw new AppError(404, ERROR_CODES.CARD_NOT_FOUND, 'No replacement card with that code');
    }
    if (replacement.status !== 'UNISSUED') {
      throw new AppError(
        409,
        ERROR_CODES.CARD_ALREADY_ISSUED,
        'That replacement card has already been issued. Take a fresh one.',
      );
    }

    await updateCard(tx, replacement.id, {
      status: original.status === 'COMPLETED' ? 'COMPLETED' : 'ISSUED',
      issuedAt: original.issuedAt ?? now,
      completedAt: original.completedAt,
      reissuedFromId: original.id,
    });

    // Copy the journey. New idempotency keys, because these are new rows for
    // the same real-world events and the originals' keys are already taken.
    for (const stamp of original.stampEvents) {
      await createStamp(tx, {
        missionCardId: replacement.id,
        stationId: stamp.stationId,
        recordedById: stamp.recordedById,
        recordedAt: stamp.recordedAt,
        source: stamp.source,
        idempotencyKey: `reissue:${replacement.id}:${stamp.stationId}`,
      });
    }

    await updateCard(tx, original.id, { status: 'VOIDED', voidedAt: now });

    await writeAudit(tx, {
      ...audit,
      action: 'card.reissue',
      entityType: 'MissionCard',
      entityId: replacement.id,
      before: { shortCode: originalCode, status: original.status },
      after: {
        shortCode: replacementCode,
        stampsCarriedOver: original.stampEvents.length,
        reason: request.reason,
      },
    });

    return { voidedCardId: original.id, stampsCarriedOver: original.stampEvents.length };
  });

  return {
    card: await getCard(replacementCode),
    voidedCardId: result.voidedCardId,
    stampsCarriedOver: result.stampsCarriedOver,
  };
}

/**
 * Generate a print batch (PRODUCT_BRIEF §4.4).
 *
 * Returns CSV of shortCode and qrPayload, ready to hand to the printer. Work
 * backwards from the print deadline, not the event date — the QR and the short
 * code have to be in the card design before it goes to print, and nothing in
 * Phase 3 works without them.
 */
export async function generateBatch(
  request: GenerateCardBatchRequest,
  audit: AuditContext,
): Promise<GenerateCardBatchResponse> {
  const rows: Array<{ shortCode: string; qrPayload: string; batchLabel: string }> = [];
  const seen = new Set<string>();

  while (rows.length < request.count) {
    const shortCode = generateShortCode();
    if (seen.has(shortCode)) continue;
    seen.add(shortCode);
    rows.push({ shortCode, qrPayload: generateQrPayload(), batchLabel: request.batchLabel });
  }

  const created = await createCardBatch(rows);

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      ...audit,
      action: 'card.issue',
      entityType: 'MissionCardBatch',
      entityId: request.batchLabel,
      after: { requested: request.count, created },
    });
  });

  const csv = [
    'shortCode,qrPayload,batchLabel',
    ...rows.map((row) => `${row.shortCode},${row.qrPayload},${row.batchLabel}`),
  ].join('\n');

  return { batchLabel: request.batchLabel, created, csv };
}

/**
 * The funnel: of the cards issued, how many reached each station and Mission
 * Complete. Every stage is a count of CARDS — journeys, not people — and the
 * response says so.
 */
export async function getFunnel(range: {
  from?: string;
  to?: string;
}): Promise<CardFunnelResponse> {
  const filter = {
    ...(range.from ? { from: new Date(range.from) } : {}),
    ...(range.to ? { to: new Date(range.to) } : {}),
  };

  const [issued, completed, redeemed, voided, perStation, stations, containsFallbackData] =
    await Promise.all([
      countIssued(filter),
      countByStatus('COMPLETED', filter),
      countRedeemedCards(filter),
      countVoided(filter),
      countCardsPerStation(filter),
      listStampingStations(),
      rangeOverlapsFallbackWindow(filter),
    ]);

  const rate = (value: number): number => (issued === 0 ? 0 : value / issued);

  return {
    unit: 'cards',
    issued,
    completed,
    redeemed,
    voided,
    stages: [
      { key: 'issued', label: 'Issued', value: issued, rateOfIssued: issued === 0 ? 0 : 1 },
      ...stations.map((station) => {
        const value = perStation.get(station.id) ?? 0;
        return {
          key: station.code,
          label: station.name,
          value,
          rateOfIssued: rate(value),
        };
      }),
      { key: 'completed', label: 'Completed', value: completed, rateOfIssued: rate(completed) },
      { key: 'redeemed', label: 'Gift redeemed', value: redeemed, rateOfIssued: rate(redeemed) },
    ],
    containsFallbackData,
  };
}

/** Exported for the dashboard, which needs the record shape without a lookup. */
export async function toRecord(card: CardWithContext): Promise<MissionCardRecord> {
  return toMissionCardRecord(card, await stampingStationIds());
}
