import { ERROR_CODES, type CreateStationRequest, type StationSummary } from '@spoh/shared';
import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError } from '../../../platform/errors/index.js';
import { toStationSummary } from '../data/mappers.js';
import { createStationRow, findStationByCode } from '../data/repo.js';

export async function createStation(
  request: CreateStationRequest,
  audit: AuditContext,
): Promise<StationSummary> {
  const existing = await findStationByCode(request.code);
  if (existing) {
    throw new ConflictError(
      ERROR_CODES.STATION_CODE_TAKEN,
      `Station code ${request.code} is already in use by ${existing.name}`,
    );
  }

  const station = await prisma.$transaction(async (tx) => {
    const row = await createStationRow(tx, {
      code: request.code,
      name: request.name,
      kind: request.kind,
      courseCode: request.courseCode ?? null,
      floor: request.floor ?? null,
      countsEntry: request.countsEntry,
      issuesStamp: request.issuesStamp,
      sortOrder: request.sortOrder,
    });
    await writeAudit(tx, {
      ...audit,
      action: 'station.create',
      entityType: 'Station',
      entityId: row.id,
      after: { code: row.code, name: row.name, kind: row.kind },
    });
    return row;
  });

  return toStationSummary(station);
}
