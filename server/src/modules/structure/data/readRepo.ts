import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { TYPE_FIELDS, TAG_FIELDS, CATEGORY_FIELDS } from './metadataRepo.js';
import { TEMPLATE_FIELDS, SHIFT_FIELDS } from './templateRepo.js';

export async function readStructureRows(scope: EventScope, tx: PrismaTransactionClient) {
  const event = await tx.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { timezone: true },
  });
  const stationTypes = await tx.stationType.findMany({
    where: { eventId: scope.eventId },
    select: TYPE_FIELDS,
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  const stationTags = await tx.stationTag.findMany({
    where: { eventId: scope.eventId },
    select: TAG_FIELDS,
    orderBy: { code: 'asc' },
  });
  const categories = await tx.captureCategory.findMany({
    where: { eventId: scope.eventId },
    select: CATEGORY_FIELDS,
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  const templates = await tx.shiftTemplate.findMany({
    where: { eventId: scope.eventId },
    select: TEMPLATE_FIELDS,
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  const shifts = await tx.shift.findMany({
    where: { eventId: scope.eventId },
    select: SHIFT_FIELDS,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });
  return {
    eventId: scope.eventId,
    timezone: event.timezone,
    stationTypes,
    stationTags,
    categories,
    templates,
    shifts,
  };
}
