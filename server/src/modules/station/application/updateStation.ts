import type { StationSummary, UpdateStationRequest } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toStationSummary } from '../data/mappers.js';
import { findStationById, updateStationRow } from '../data/repo.js';

/** The patch as a row update: only the fields the request names. */
function toUpdate(patch: UpdateStationRequest): Prisma.StationUpdateInput {
  return {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.courseCode !== undefined ? { courseCode: patch.courseCode ?? null } : {}),
    ...(patch.floor !== undefined ? { floor: patch.floor ?? null } : {}),
    ...(patch.countsEntry !== undefined ? { countsEntry: patch.countsEntry } : {}),
    ...(patch.issuesStamp !== undefined ? { issuesStamp: patch.issuesStamp } : {}),
    ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    ...(patch.active !== undefined ? { active: patch.active } : {}),
  };
}

/**
 * Turning off `issuesStamp` changes what "complete" means for every Mission
 * Card, because completion is computed against the number of stamping
 * stations. Cards already complete keep their status; the change is audited
 * so a shifting completion rate has an explanation.
 */
export async function updateStation(
  id: string,
  patch: UpdateStationRequest,
  audit: AuditContext,
): Promise<StationSummary> {
  const existing = await findStationById(id);
  if (!existing) throw new NotFoundError('Station');

  const station = await prisma.$transaction(async (tx) => {
    const row = await updateStationRow(tx, { id, data: toUpdate(patch) });
    await writeAudit(tx, {
      ...audit,
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
    return row;
  });

  return toStationSummary(station);
}
