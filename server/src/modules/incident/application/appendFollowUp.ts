import type { CreateIncidentFollowUpRequest, IncidentRecord } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { addFollowUp, findIncidentForUpdate } from '../data/repo.js';
import { getIncident } from './incidentRecord.js';

/** Add to an incident's append-only log: the original report is never edited. */
export async function appendFollowUp(
  incidentId: string,
  request: CreateIncidentFollowUpRequest,
  { volunteerId, scope, audit }: ActorContext,
): Promise<IncidentRecord> {
  await prisma.$transaction(async (tx) => {
    const existing = await findIncidentForUpdate(tx, scope, incidentId);
    if (!existing) throw new NotFoundError('Incident');
    await addFollowUp(tx, scope, {
      incidentId,
      note: request.note,
      authorId: volunteerId,
      rehearsal: existing.rehearsal,
    });
    await writeAudit(tx, {
      ...audit,
      action: 'incident.followUp',
      entityType: 'Incident',
      entityId: incidentId,
      after: { followUpAdded: true, rehearsal: existing.rehearsal },
    });
  });

  return getIncident(scope, incidentId);
}
