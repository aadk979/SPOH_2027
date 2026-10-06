import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { categoryScheduleDefinitions } from '../data/categoryScheduleAuditRepo.js';
import type { CategoryScheduleRow } from '../data/categoryScheduleRepo.js';
import {
  CategoryScheduleCreationAudit,
  supportedCategorySchedule,
} from '../domain/categoryScheduleProvenance.js';

export async function requireCategorySchedule(
  tx: PrismaTransactionClient,
  input: { scope: EventScope; categoryId: string; row: CategoryScheduleRow | null },
) {
  if (!input.row) throw new NotFoundError('Category schedule');
  const row = input.row;
  const audits = await categoryScheduleDefinitions(input.scope, { tx, ids: [row.id] });
  const definition = supportedCategorySchedule(row, audits);
  if (!definition || definition.intent.categoryId !== input.categoryId)
    throw new NotFoundError('Category schedule');
  const original = CategoryScheduleCreationAudit.parse(
    audits.find((audit) => audit.action === 'schedule.create')!.after,
  ).intent;
  return { row, definition, original, audits };
}
