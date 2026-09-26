import type { CreateRegistrationRequest, CreateRegistrationResponse } from '@spoh/shared';
import { auditStationScopeBypass, writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { CaptureContext } from '../../../platform/http/captureActor.js';
import { startOfEventDay, systemClock } from '../../../platform/time/index.js';
import { requireActiveStation } from '../../station/index.js';
import { toRegistrationRecord } from '../data/mappers.js';
import { countForRecorderSince, countForStationSince, createRegistration } from '../data/repo.js';

/**
 * COUNT 1 — one tap, one registration (PRODUCT_BRIEF §0.1, §2).
 *
 * One row, no confirmation. Nothing here can be made to write a name, a school
 * or a contact detail: the request has nowhere to put one, and neither does
 * the table.
 */
export async function recordRegistration(
  request: CreateRegistrationRequest,
  { actor, audit, clock = systemClock }: CaptureContext,
): Promise<CreateRegistrationResponse> {
  const station = await requireActiveStation(request.stationId);
  // Stamped by the server, on receipt. The client's own timestamp is stored
  // alongside it — a phone that slept for ten minutes would otherwise skew the
  // curve — but the server's clock is the one every report buckets against.
  const recordedAt = clock.now();

  const registration = await prisma.$transaction(async (tx) => {
    const row = await createRegistration(tx, {
      category: request.category,
      stationId: station.id,
      recordedById: actor.volunteerId,
      recordedAt,
      clientRecordedAt: request.clientRecordedAt ? new Date(request.clientRecordedAt) : null,
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

  const since = startOfEventDay(clock.now());
  // Independent queries, so they go together. Serialising them put an extra
  // round trip on the critical path of every booth tap.
  const [sessionTotal, boothTotal] = await Promise.all([
    countForRecorderSince(actor.volunteerId, station.id, since),
    countForStationSince(station.id, since),
  ]);

  return { registration: toRegistrationRecord(registration), sessionTotal, boothTotal };
}
