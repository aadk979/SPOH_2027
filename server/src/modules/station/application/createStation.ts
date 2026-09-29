import { ERROR_CODES, type CreateStationRequest, type StationSummary } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toStationSummary } from '../data/mappers.js';
import {
  createStationRow,
  findStationById,
  findStationByCode,
  setCourseTag,
  typeIdFor,
} from '../data/repo.js';

export async function createStation(
  request: CreateStationRequest,
  actor: ActorContext,
): Promise<StationSummary> {
  const { scope } = actor;
  const existing = await findStationByCode(scope, request.code);
  if (existing) {
    throw new ConflictError(
      ERROR_CODES.STATION_CODE_TAKEN,
      `Station code ${request.code} is already in use by ${existing.name}`,
    );
  }

  const station = await prisma.$transaction(async (tx) => {
    const row = await createStationRow(tx, scope, {
      code: request.code,
      name: request.name,
      kind: request.kind,
      typeId: await typeIdFor(tx, scope, request),
      courseCode: request.courseCode ?? null,
      floor: request.floor ?? null,
      countsEntry: request.countsEntry,
      issuesStamp: request.issuesStamp,
      sortOrder: request.sortOrder,
    });
    await setCourseTag(tx, scope, row);
    await writeAudit(tx, {
      ...actor.audit,
      action: 'station.create',
      entityType: 'Station',
      entityId: row.id,
      after: { code: row.code, name: row.name, kind: row.kind },
    });
    return (await findStationById(scope, row.id, tx)) ?? row;
  });

  return toStationSummary(station);
}
