import type { StationSummary, UpdateStationRequest } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { toStationSummary, toStationUpdate } from '../data/mappers.js';
import { findStationById, updateStationRow } from '../data/repo.js';

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
    const row = await updateStationRow(tx, { id, data: toStationUpdate(patch) });
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
