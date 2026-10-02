import type { StationSummary, UpdateStationRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toStationSummary, toStationUpdate } from '../data/mappers.js';
import { findStationById, setTags, updateStationRow } from '../data/repo.js';
import { requireStationTags, requireStationType } from './requireStationStructure.js';

/**
 * Turning off `issuesStamp` changes what "complete" means for every Mission
 * Card, because completion is computed against the number of stamping
 * stations. Cards already complete keep their status; the change is audited
 * so a shifting completion rate has an explanation.
 *
 * Changing the type changes what happens at the station (ADR-002).
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
    await holdCaptureEvent(tx, scope);
    const typeId = patch.typeCode ? await requireStationType(tx, scope, patch.typeCode) : undefined;
    const row = await updateStationRow(tx, scope, {
      id,
      data: { ...toStationUpdate(patch), ...(typeId ? { typeId } : {}) },
    });
    if (patch.tagCodes) {
      await setTags(tx, scope, { id, tagIds: await requireStationTags(tx, scope, patch.tagCodes) });
    }
    await writeAudit(tx, {
      ...actor.audit,
      action: 'station.update',
      entityType: 'Station',
      entityId: id,
      before: {
        name: existing.name,
        typeCode: existing.type.code,
        tagCodes: existing.tags.map(({ tag }) => tag.code),
        active: existing.active,
      },
      after: { ...patch },
    });
    return (await findStationById(scope, id, tx)) ?? row;
  });

  return toStationSummary(station);
}
