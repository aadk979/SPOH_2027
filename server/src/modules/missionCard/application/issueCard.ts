import { assertCardProvenance } from '../domain/cardRules.js';
import { admitCountCapture } from '../../../platform/db/countCaptureAdmission.js';
import type { IssueCardRequest, MissionCardRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { lockCurrentActor, requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { stationCandidates } from '../../../platform/access/stationCandidates.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { systemClock } from '../../../platform/time/index.js';
import {
  attachGroupRegistrations,
  findCardRow,
  lockCard,
  updateCard,
} from '../data/repo.js';
import { assertCardNotVoided, requireCard } from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { getCardById } from './getCard.js';
import { simpleCardReceipt } from './cardReceipt.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { lockGroupStations } from '../data/repo.js';

async function requireGroupAuthority(tx: PrismaTransactionClient, context: CaptureContext,
  input: { groupId: string; shiftAt: Date; lateSyncAllowed: boolean }) {
  const stations = await lockGroupStations(tx, context.scope, input.groupId);
  if (!stations.length) throw new NotFoundError('Registration group');
  for (const { stationId } of stations) {
    await requireCurrentPermission(tx, { scope: context.scope, membershipId: context.actor.membershipId,
      personId: context.actor.volunteerId, action: 'Registration.Create', clock: context.clock,
      shiftAt: input.shiftAt, facts: { lateSyncAllowed: input.lateSyncAllowed }, resource: { type: 'Station', id: stationId } });
  }
}

async function applyIssue(tx: PrismaTransactionClient, context: CaptureContext,
  input: { shortCode: string; request: IssueCardRequest }): Promise<string> {
  const { scope, audit, actor, clock = systemClock } = context;
  const { shortCode, request } = input;
  const { shiftAt, ...provenance } = await admitCountCapture(tx, scope, { request, clock });
  const identity = { scope, membershipId: actor.membershipId, personId: actor.volunteerId };
  await lockCurrentActor(tx, identity);
  await requireCurrentPermission(tx, { ...identity, action: 'Registration.Create', clock, shiftAt,
    resource: await stationCandidates(tx, scope, actor.membershipId),
    facts: { lateSyncAllowed: provenance.lateSync !== undefined } });
  await lockReserved(tx, scope, request.idempotencyKey);
  await lockCard(tx, scope, shortCode);
  const existing = requireCard(await findCardRow(tx, scope, shortCode));
  assertCardProvenance(existing, provenance);
  assertCardNotVoided(existing, 'That card has been voided. Issue a fresh one.');
  if (request.groupId) await requireGroupAuthority(tx, context, { groupId: request.groupId,
    shiftAt, lateSyncAllowed: provenance.lateSync !== undefined });
  if (existing.status === 'UNISSUED') {
    await updateCard(tx, scope, { id: existing.id, data: { status: 'ISSUED', issuedAt: clock.now() } });
    await writeAudit(tx, { ...audit, action: 'card.issue', entityType: 'MissionCard',
      entityId: existing.id, after: { shortCode, groupId: request.groupId ?? null,
        rehearsal: provenance.rehearsal,
        ...(provenance.lateSync ? { lateSync: provenance.lateSync } : {}) } });
  }
  if (request.groupId)
    await attachGroupRegistrations(tx, scope, { groupId: request.groupId, cardId: existing.id });
  await settleReserved(tx, scope, { key: request.idempotencyKey, statusCode: 200,
    body: simpleCardReceipt('ISSUE', existing) });
  return existing.id;
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
  context: CaptureContext,
): Promise<MissionCardRecord> {
  const shortCode = normaliseShortCode(shortCodeInput);

  const cardId = await prisma.$transaction((tx) => applyIssue(tx, context, { shortCode, request }));
  return getCardById(context.scope, cardId);
}
