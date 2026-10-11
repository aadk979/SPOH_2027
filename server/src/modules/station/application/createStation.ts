import { ERROR_CODES, type CreateStationRequest, type StationSummary } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { requireStructureChange } from '../../structure/index.js';
import { ConflictError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toStationSummary } from '../data/mappers.js';
import { createStationRow, findStationById, findStationByCode, setTags } from '../data/repo.js';
import { requireStationTags, requireStationType } from './requireStationStructure.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';

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
    await requireStructureChange(actor, tx);
    if (request.idempotencyKey) await lockReserved(tx, scope, request.idempotencyKey);
    const row = await createStationRow(tx, scope, {
      code: request.code,
      name: request.name,
      typeId: await requireStationType(tx, scope, request.typeCode),
      floor: request.floor ?? null,
      sortOrder: request.sortOrder,
    });
    const tagIds = await requireStationTags(tx, scope, request.tagCodes);
    await setTags(tx, scope, { id: row.id, tagIds });
    await writeAudit(tx, {
      ...actor.audit,
      action: 'station.create',
      entityType: 'Station',
      entityId: row.id,
      after: {
        code: row.code,
        name: row.name,
        typeCode: request.typeCode,
        tagCodes: request.tagCodes,
      },
    });
    const result = (await findStationById(scope, row.id, tx)) ?? row;
    if (request.idempotencyKey)
      await settleReserved(tx, scope, {
        key: request.idempotencyKey,
        statusCode: 201,
        body: { station: toStationSummary(result) },
      });
    return result;
  });

  return toStationSummary(station);
}
