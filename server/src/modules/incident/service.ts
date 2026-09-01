import type {
  CreateIncidentFollowUpRequest,
  CreateIncidentRequest,
  IncidentRecord,
  ListIncidentsQuery,
  UpdateIncidentStatusRequest,
} from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../lib/audit.js';
import { NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import {
  addFollowUp,
  createIncident,
  findIncidentById,
  listIncidents,
  toIncidentRecord,
  updateIncidentStatus,
} from './repo.js';

/**
 * Incident reporting (PRODUCT_BRIEF §7.1).
 *
 * An incident is immutable once submitted. Corrections and updates go into an
 * append-only follow-up log, so the record of what was reported at the time
 * survives intact — which is the whole point of having it for the post-event
 * report rather than reconstructing it from memory a week later.
 */

export async function reportIncident(
  request: CreateIncidentRequest,
  reporterId: string,
  audit: AuditContext,
): Promise<IncidentRecord> {
  const incident = await prisma.$transaction(async (tx) => {
    const row = await createIncident(tx, {
      type: request.type,
      severity: request.severity,
      stationId: request.stationId ?? null,
      locationNote: request.locationNote ?? null,
      description: request.description,
      reportedById: reporterId,
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

  notifySafetyChain(incident.id, request.severity);

  return toIncidentRecord(incident);
}

export async function getIncident(id: string): Promise<IncidentRecord> {
  const incident = await findIncidentById(id);
  if (!incident) throw new NotFoundError('Incident');
  return toIncidentRecord(incident);
}

export async function listIncidentRecords(query: ListIncidentsQuery): Promise<IncidentRecord[]> {
  const incidents = await listIncidents({
    ...(query.status ? { status: query.status } : {}),
    ...(query.severity ? { severity: query.severity } : {}),
    ...(query.stationId ? { stationId: query.stationId } : {}),
    ...(query.from ? { from: new Date(query.from) } : {}),
    ...(query.to ? { to: new Date(query.to) } : {}),
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });

  return Promise.all(incidents.map(toIncidentRecord));
}

export async function appendFollowUp(
  incidentId: string,
  request: CreateIncidentFollowUpRequest,
  authorId: string,
  audit: AuditContext,
): Promise<IncidentRecord> {
  const existing = await findIncidentById(incidentId);
  if (!existing) throw new NotFoundError('Incident');

  await prisma.$transaction(async (tx) => {
    await addFollowUp(tx, { incidentId, note: request.note, authorId });

    await writeAudit(tx, {
      ...audit,
      action: 'incident.followUp',
      entityType: 'Incident',
      entityId: incidentId,
      after: { followUpAdded: true },
    });
  });

  return getIncident(incidentId);
}

export async function changeIncidentStatus(
  incidentId: string,
  request: UpdateIncidentStatusRequest,
  actorId: string,
  audit: AuditContext,
): Promise<IncidentRecord> {
  const existing = await findIncidentById(incidentId);
  if (!existing) throw new NotFoundError('Incident');

  await prisma.$transaction(async (tx) => {
    await updateIncidentStatus(tx, incidentId, request.status);

    if (request.note) {
      await addFollowUp(tx, { incidentId, note: request.note, authorId: actorId });
    }

    await writeAudit(tx, {
      ...audit,
      action: 'incident.statusChange',
      entityType: 'Incident',
      entityId: incidentId,
      before: { status: existing.status },
      after: { status: request.status },
    });
  });

  return getIncident(incidentId);
}

/**
 * Notify the Safety IC, the Deputy Coordinator (Welfare, Safety &
 * Communications) and the Chief.
 *
 * Push delivery is Phase 3 work. Until it exists this writes a structured log
 * line rather than pretending to notify anyone — the WhatsApp Safety
 * Communications Chat remains the human channel and the app feeds it rather
 * than replacing it (PRODUCT_BRIEF §7.4).
 */
function notifySafetyChain(incidentId: string, severity: string): void {
  logger.warn({ incidentId, severity }, 'incident reported — safety chain notification pending');
}
