import type { CreateIncidentRequest, IncidentRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { findStationById } from '../../station/index.js';
import { createIncident, findIncidentById } from '../data/repo.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toRecordWithAuthors } from './incidentRecord.js';
import { notifySafetyChain } from './notifySafetyChain.js';

/** Record an incident as reported, and push a severe one to the safety chain. */
export async function reportIncident(
  request: CreateIncidentRequest,
  { volunteerId, scope, audit }: ActorContext,
): Promise<IncidentRecord> {
  const incident = await prisma.$transaction(async (tx) => {
    const row = await createIncident(tx, scope, {
      type: request.type,
      severity: request.severity,
      stationId: request.stationId ?? null,
      locationNote: request.locationNote ?? null,
      description: request.description,
      reportedById: volunteerId,
      occurredAt: new Date(request.occurredAt),
      reportedAt: new Date(),
      idempotencyKey: request.idempotencyKey,
    });
    await writeAudit(tx, {
      ...audit,
      action: 'incident.create',
      entityType: 'Incident',
      entityId: row.id,
      // The description is deliberately not copied into the audit payload: it
      // is already immutable on the incident, and duplicating free text into a
      // second table doubles the surface for anything that should not be there.
      after: { type: row.type, severity: row.severity, stationId: row.stationId },
    });
    return row;
  });

  const station = incident.stationId ? await findStationById(scope, incident.stationId) : null;
  notifySafetyChain(
    scope,
    {
      id: incident.id,
      severity: incident.severity,
      type: incident.type,
      stationName: station?.name ?? request.locationNote ?? null,
    },
    volunteerId,
  );

  // Loaded after commit: its relations would overlap on the transaction's
  // connection (F03-019).
  const created = await findIncidentById(scope, incident.id);
  if (!created) throw new NotFoundError('Incident');
  return toRecordWithAuthors(created);
}
