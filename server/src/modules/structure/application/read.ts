import { StructureResponse } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { readStructureRows } from '../data/readRepo.js';
import { toCategoryRecord, toShiftException } from '../data/mappers.js';

export function readStructure(scope: EventScope) {
  return prisma.$transaction(async (tx) => {
    const rows = await readStructureRows(scope, tx);
    return StructureResponse.parse({
      data: {
        ...rows,
        categories: rows.categories.map(toCategoryRecord),
        shifts: rows.shifts.map((row) => toShiftException(row, rows.timezone)),
      },
    });
  });
}
