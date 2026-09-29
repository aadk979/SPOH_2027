import type { StationSummary, UpdateStationRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toStationSummary, toStationUpdate } from '../data/mappers.js';
import { findStationById, setCourseTag, typeIdFor, updateStationRow } from '../data/repo.js';

/**
 * Turning off `issuesStamp` changes what "complete" means for every Mission
 * Card, because completion is computed against the number of stamping
 * stations. Cards already complete keep their status; the change is audited
 * so a shifting completion rate has an explanation.
 *
 * The type follows the kind and flags, and the tag the course (expand phase).
 */
export async function updateStation(
  id: string,
  patch: UpdateStationRequest,
  actor: ActorContext,
): Promise<StationSummary> {
  const { scope } = actor;
  const existing = await findStationById(scope, id);
  if (!existing) throw new NotFoundError('Station');

  const station = await prisma.$transaction(async (tx) => {
    const typeId = await typeIdFor(tx, scope, {
      kind: patch.kind ?? existing.kind,
      countsEntry: patch.countsEntry ?? existing.countsEntry,
      issuesStamp: patch.issuesStamp ?? existing.issuesStamp,
    });
    const row = await updateStationRow(tx, scope, {
      id,
      data: { ...toStationUpdate(patch), typeId },
    });
    if (patch.courseCode !== undefined) await setCourseTag(tx, scope, row);
    await writeAudit(tx, {
      ...actor.audit,
      action: 'station.update',
      entityType: 'Station',
      entityId: id,
      before: {
        name: existing.name,
        countsEntry: existing.countsEntry,
        issuesStamp: existing.issuesStamp,
        active: existing.active,
      },
      after: { ...patch },
    });
    return (await findStationById(scope, id, tx)) ?? row;
  });

  return toStationSummary(station);
}
