import { captureStation } from '../../../platform/access/captureStation.js';
import type { CreateRegistrationRequest, CreateRegistrationResponse } from '@spoh/shared';
import { auditStationScopeBypass, writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { eventTodayStart } from '../../../platform/event/today.js';
import { systemClock } from '../../../platform/time/index.js';
import { requireActiveStation } from '../../station/index.js';
import { recordVisitorValues } from '../../visitor/index.js';
import { toRegistrationRecord } from '../data/mappers.js';
import { countForRecorderSince, countForStationSince, createRegistration } from '../data/repo.js';
import { requireCategory } from './requireCategory.js';

/**
 * COUNT 1 — one tap, one registration (PRODUCT_BRIEF §0.1, §2).
 *
 * One row, no confirmation. The registration can never hold a name, a school
 * or a contact detail. An event in allowlist mode may send its declared
 * visitor fields; they go to the visitor record, apart from the count, and
 * are never echoed back (ADR-002 §4).
 */
export async function recordRegistration(
  request: CreateRegistrationRequest,
  { actor, scope, audit, clock = systemClock }: CaptureContext,
): Promise<CreateRegistrationResponse> {
  const station = await requireActiveStation(scope, request.stationId);
  // Stamped by the server, on receipt. The client's own timestamp is stored
  // alongside it — a phone that slept for ten minutes would otherwise skew the
  // curve — but the server's clock is the one every report buckets against.
  const recordedAt = clock.now();

  const registration = await prisma.$transaction(async (tx) => {
    const { stationScopeBypass } = await captureStation(tx, { scope, actor, clock }, request);
    const category = await requireCategory(tx, scope, request.category);
    const row = await createRegistration(tx, scope, {
      categoryId: category.id,
      stationId: station.id,
      recordedById: actor.volunteerId,
      recordedByMembershipId: actor.membershipId,
      recordedAt,
      clientRecordedAt: request.clientRecordedAt ? new Date(request.clientRecordedAt) : null,
      idempotencyKey: request.idempotencyKey,
      source: 'APP',
    });
    if (request.visitor) {
      await recordVisitorValues(tx, scope, { registrationId: row.id, values: request.visitor });
    }
    await auditStationScopeBypass(tx, stationScopeBypass, audit);
    await writeAudit(tx, {
      ...audit,
      action: 'registration.create',
      entityType: 'Registration',
      entityId: row.id,
      after: { category: row.captureCategory.code, stationId: row.stationId },
    });
    return row;
  });

  const since = await eventTodayStart(scope, clock.now());
  const countsScope = { ...scope, rehearsal: registration.rehearsal };
  // Independent queries, so they go together. Serialising them put an extra
  // round trip on the critical path of every booth tap.
  const [sessionTotal, boothTotal] = await Promise.all([
    countForRecorderSince(
      countsScope,
      { recordedById: actor.volunteerId, stationId: station.id },
      since,
    ),
    countForStationSince(countsScope, station.id, since),
  ]);

  return { registration: toRegistrationRecord(registration), sessionTotal, boothTotal };
}
