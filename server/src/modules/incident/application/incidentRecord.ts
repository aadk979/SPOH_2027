import type { IncidentRecord } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toIncidentRecord } from '../data/mappers.js';
import { findAuthorNames, findIncidentById, type IncidentWithContext } from '../data/repo.js';

/** One incident as a record, with its follow-up authors' names loaded. */
export async function toRecordWithAuthors(incident: IncidentWithContext): Promise<IncidentRecord> {
  const authorIds = [...new Set(incident.followUps.map((followUp) => followUp.authorId))];
  return toIncidentRecord(incident, await findAuthorNames(authorIds));
}

export async function getIncident(id: string): Promise<IncidentRecord> {
  const incident = await findIncidentById(id);
  if (!incident) throw new NotFoundError('Incident');
  return toRecordWithAuthors(incident);
}
