import type { IncidentRecord } from '@spoh/shared';
import type { IncidentWithContext } from './repo.js';

/** An incident as the API returns it; follow-up author names come in with it. */
export function toIncidentRecord(
  incident: IncidentWithContext,
  authorNames: ReadonlyMap<string, string>,
): IncidentRecord {
  return {
    id: incident.id,
    rehearsal: incident.rehearsal,
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    stationId: incident.stationId,
    stationName: incident.station?.name ?? null,
    locationNote: incident.locationNote,
    description: incident.description,
    reportedById: incident.reportedById,
    reportedByName: incident.reportedBy.displayName,
    occurredAt: incident.occurredAt.toISOString(),
    reportedAt: incident.reportedAt.toISOString(),
    followUps: incident.followUps.map((followUp) => ({
      id: followUp.id,
      note: followUp.note,
      authorId: followUp.authorId,
      authorName: authorNames.get(followUp.authorId) ?? 'Unknown',
      createdAt: followUp.createdAt.toISOString(),
    })),
  };
}
