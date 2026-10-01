import type { ShiftTemplateRecord } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { toShiftTemplateRecord } from '../data/mappers.js';
import { listTemplateRows } from '../data/repo.js';

export async function listShiftTemplates(scope: EventScope): Promise<ShiftTemplateRecord[]> {
  return (await listTemplateRows(scope)).map(toShiftTemplateRecord);
}
