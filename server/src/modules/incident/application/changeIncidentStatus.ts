import type { IncidentRecord, UpdateIncidentStatusRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { addFollowUp, findIncidentForUpdate, updateIncidentStatus } from '../data/repo.js';
import { assertIncidentTransition } from '../domain/statusTransitions.js';
import { getIncident } from './incidentRecord.js';

/** Move an incident through its status, with an optional note in its log. */
export async function changeIncidentStatus(
  incidentId: string,
  request: UpdateIncidentStatusRequest,
  { volunteerId, scope, audit }: ActorContext,
): Promise<IncidentRecord> {
  await prisma.$transaction(async (tx) => {
    const existing = await findIncidentForUpdate(tx, scope, incidentId);
    if (!existing) throw new NotFoundError('Incident');
    assertIncidentTransition(existing.status, request.status, request.note);
    await updateIncidentStatus(tx, scope, { id: incidentId, status: request.status });
    if (request.note) {
      await addFollowUp(tx, scope, {
        incidentId,
        note: request.note,
        authorId: volunteerId,
        rehearsal: existing.rehearsal,
      });
    }
    await writeAudit(tx, {
      ...audit,
      action: 'incident.statusChange',
      entityType: 'Incident',
      entityId: incidentId,
      before: { status: existing.status, rehearsal: existing.rehearsal },
      after: { status: request.status, rehearsal: existing.rehearsal },
    });
  });

  return getIncident(scope, incidentId);
}
