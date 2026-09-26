import { randomUUID } from 'node:crypto';
import {
  ERROR_CODES,
  type CreateGroupRegistrationRequest,
  type CreateGroupRegistrationResponse,
  type CreateRegistrationRequest,
  type CreateRegistrationResponse,
  type RegistrationSummaryQuery,
  type RegistrationSummaryResponse,
} from '@spoh/shared';
import {
  auditStationScopeBypass,
  writeAudit,
  type AuditContext,
} from '../../platform/audit/index.js';
import type { CaptureActor } from '../../platform/http/captureActor.js';
import { AppError, NotFoundError } from '../../platform/errors/index.js';
import { prisma } from '../../platform/db/client.js';
import { eventDayAnchor, singaporeDateString } from '../../platform/time/index.js';
import { rangeOverlapsFallbackWindow } from '../fallback/repo.js';
import { requireActiveStation } from '../station/index.js';
import {
  countForRecorderSince,
  countForStationSince,
  countMatching,
  createRegistration,
  createRegistrationsForGroup,
  findRegistrationById,
  groupByCategory,
  groupByTimeBucket,
  toRegistrationRecord,
  voidRegistration,
} from './repo.js';

/**
 * COUNT 1 — registrations (PRODUCT_BRIEF §0.1, §2).
 *
 * One tap, one row, no confirmation. Nothing in this service can be made to
 * write a name, a school or a contact detail — the request DTO has nowhere to
 * put one, and neither does the table.
 */

/** The start of today in Singapore, as the boundary for "session" totals. */
function startOfEventDay(now = new Date()): Date {
  return eventDayAnchor(singaporeDateString(now));
}

export async function recordRegistration(
  request: CreateRegistrationRequest,
  actor: CaptureActor,
  audit: AuditContext,
): Promise<CreateRegistrationResponse> {
  const station = await requireActiveStation(request.stationId);
  const clientRecordedAt = request.clientRecordedAt ? new Date(request.clientRecordedAt) : null;
  // Stamped by the server, on receipt. The client's own timestamp is stored
  // alongside it — a phone that slept for ten minutes would otherwise skew the
  // curve — but the server's clock is the one every report buckets against.
  const recordedAt = new Date();

  const registration = await prisma.$transaction(async (tx) => {
    const row = await createRegistration(tx, {
      category: request.category,
      stationId: station.id,
      recordedById: actor.volunteerId,
      recordedAt,
      clientRecordedAt,
      idempotencyKey: request.idempotencyKey,
      source: 'APP',
    });

    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);

    await writeAudit(tx, {
      ...audit,
      action: 'registration.create',
      entityType: 'Registration',
      entityId: row.id,
      after: { category: row.category, stationId: row.stationId },
    });

    return row;
  });

  const since = startOfEventDay();

  // Independent queries, so they go together. Serialising them put an extra
  // round trip on the critical path of every booth tap.
  const [sessionTotal, boothTotal] = await Promise.all([
    countForRecorderSince(actor.volunteerId, station.id, since),
    countForStationSince(station.id, since),
  ]);

  return { registration: toRegistrationRecord(registration), sessionTotal, boothTotal };
}

/**
 * Group registration (PRODUCT_BRIEF §2.2).
 *
 * A family of four is four registration rows and one Mission Card. The card
 * link is best-effort on purpose: if the card cannot be found or is already
 * issued, the registrations still stand and only that card's journey goes
 * untracked. An optional path must never block a mandatory one (§2.3).
 */
export async function recordGroupRegistration(
  request: CreateGroupRegistrationRequest,
  actor: CaptureActor,
  audit: AuditContext,
): Promise<CreateGroupRegistrationResponse> {
  const station = await requireActiveStation(request.stationId);
  const clientRecordedAt = request.clientRecordedAt ? new Date(request.clientRecordedAt) : null;
  const recordedAt = new Date();
  const groupId = randomUUID();

  const { registrations, linkedCardId, cardLinkError } = await prisma.$transaction(async (tx) => {
    let cardId: string | null = null;
    let linkError: string | null = null;

    if (request.missionCardShortCode) {
      const card = await tx.missionCard.findUnique({
        where: { shortCode: request.missionCardShortCode.toUpperCase() },
        select: { id: true, status: true },
      });

      if (!card) {
        linkError = 'Card not found. The registrations were still recorded.';
      } else if (card.status === 'VOIDED') {
        linkError = 'That card has been voided. The registrations were still recorded.';
      } else {
        cardId = card.id;
        await tx.missionCard.update({
          where: { id: card.id },
          data: { status: 'ISSUED', issuedAt: recordedAt },
        });
      }
    }

    // One row per person, expanded from the counts the booth entered. The
    // idempotency key is suffixed per row because the column is unique and the
    // whole group shares one client-generated key.
    const rows = request.members.flatMap((member) =>
      Array.from({ length: member.count }, (_unused, index) => ({
        category: member.category,
        stationId: station.id,
        recordedById: actor.volunteerId,
        groupId,
        missionCardId: cardId,
        recordedAt,
        clientRecordedAt,
        idempotencyKey: `${request.idempotencyKey}:${member.category}:${index}`,
        source: 'APP' as const,
      })),
    );

    const created = await createRegistrationsForGroup(tx, rows);

    await auditStationScopeBypass(tx, actor.stationScopeBypass, audit);

    await writeAudit(tx, {
      ...audit,
      action: 'registration.createGroup',
      entityType: 'Registration',
      entityId: groupId,
      after: {
        groupId,
        stationId: station.id,
        memberCount: created.length,
        linkedCardId: cardId,
        cardLinkError: linkError,
      },
    });

    return { registrations: created, linkedCardId: cardId, cardLinkError: linkError };
  });

  return {
    groupId,
    registrations: registrations.map(toRegistrationRecord),
    linkedCardId,
    cardLinkError,
    boothTotal: await countForStationSince(station.id, startOfEventDay()),
  };
}

/**
 * Voiding keeps the row and excludes it from every count. Deleting it would
 * make the correction invisible, and reconciliation depends on being able to
 * see what was corrected and why.
 */
export async function voidRegistrationById(
  id: string,
  reason: string,
  audit: AuditContext,
): Promise<void> {
  const existing = await findRegistrationById(id);
  if (!existing) throw new NotFoundError('Registration');

  if (existing.voided) {
    throw new AppError(409, ERROR_CODES.ALREADY_VOIDED, 'This registration is already voided');
  }

  await prisma.$transaction(async (tx) => {
    const updated = await voidRegistration(tx, id, reason);

    await writeAudit(tx, {
      ...audit,
      action: 'registration.void',
      entityType: 'Registration',
      entityId: id,
      before: { voided: false, category: existing.category },
      after: { voided: true, voidedReason: updated.voidedReason },
    });
  });
}

export async function summariseRegistrations(
  query: RegistrationSummaryQuery,
): Promise<RegistrationSummaryResponse> {
  const filter = {
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
  };

  const [total, containsFallbackData] = await Promise.all([
    countMatching(filter),
    rangeOverlapsFallbackWindow(filter),
  ]);

  const buckets =
    query.groupBy === 'category'
      ? (await groupByCategory(filter)).map((row) => ({ key: row.category, value: row.count }))
      : (await groupByTimeBucket(filter, query.groupBy)).map((row) => ({
          key: row.bucket.toISOString(),
          value: row.count,
        }));

  return {
    // The unit is stated explicitly on every count so nobody can add this to a
    // footfall figure by accident (PRODUCT_BRIEF §0.1).
    unit: 'registrations',
    groupBy: query.groupBy,
    total,
    buckets,
    containsFallbackData,
  };
}
