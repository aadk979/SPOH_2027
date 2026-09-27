import type { IncidentRecord } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toIncidentRecord } from '../data/mappers.js';
import { findAuthorNames, findIncidentById, type IncidentWithContext } from '../data/repo.js';

/**
 * Incidents as records, with every follow-up author's name loaded in one
 * query for the whole list rather than one per incident (F03-029): the list is
 * polled by the safety screens.
 */
export async function toRecordsWithAuthors(
  incidents: readonly IncidentWithContext[],
): Promise<IncidentRecord[]> {
  const authorIds = new Set(
    incidents.flatMap((incident) => incident.followUps.map((f) => f.authorId)),
  );
  const names = await findAuthorNames([...authorIds]);
  return incidents.map((incident) => toIncidentRecord(incident, names));
}

/** One incident as a record, with its follow-up authors' names loaded. */
export async function toRecordWithAuthors(incident: IncidentWithContext): Promise<IncidentRecord> {
  const [record] = await toRecordsWithAuthors([incident]);
  return record as IncidentRecord;
}

export async function getIncident(id: string): Promise<IncidentRecord> {
  const incident = await findIncidentById(id);
  if (!incident) throw new NotFoundError('Incident');
  return toRecordWithAuthors(incident);
}
