import { z } from 'zod';
import { CategoryScheduleCreationIntent, Id, UpdateCategoryScheduleRequest } from '@spoh/shared';

const Payload = z.object({ kind: z.literal('category'), id: Id, active: z.boolean() }).strict();
export const CategoryScheduleCreationAudit = z
  .object({ version: z.literal(1), intent: CategoryScheduleCreationIntent })
  .strict();
export const CategoryScheduleEditAudit = z
  .object({
    version: z.number().int().min(2),
    intent: CategoryScheduleCreationIntent,
    request: UpdateCategoryScheduleRequest.omit({ idempotencyKey: true }),
  })
  .strict()
  .refine(({ version, intent, request }) => {
    const { expectedScheduleVersion, ...review } = request;
    const { categoryId: _id, ...definition } = intent;
    return (
      expectedScheduleVersion === version - 1 &&
      JSON.stringify(review) === JSON.stringify(definition)
    );
  });

export interface CategoryScheduleDefinitionRow {
  type: string;
  payload: unknown;
  eventId: string | null;
  recurrence: number | null;
  dedupeKey: string | null;
  createdByPersonId: string | null;
  version: number;
  scheduledFor: Date | null;
  runAt: Date;
}
export interface CategoryDefinitionAudit {
  action: string;
  actorId: string | null;
  after: unknown;
}

function auditedDefinitions(row: CategoryScheduleDefinitionRow, audits: CategoryDefinitionAudit[]) {
  const created = audits.filter((audit) => audit.action === 'schedule.create');
  if (created.length !== 1 || created[0]!.actorId !== row.createdByPersonId) return null;
  const original = CategoryScheduleCreationAudit.safeParse(created[0]!.after);
  if (!original.success) return null;
  const definitions: Array<{ version: number; intent: CategoryScheduleCreationIntent }> = [
    original.data,
  ];
  for (const audit of audits.filter((entry) => entry.action === 'schedule.update')) {
    const edited = CategoryScheduleEditAudit.safeParse(audit.after);
    if (!edited.success || audit.actorId !== row.createdByPersonId) return null;
    if (edited.data.intent.categoryId !== original.data.intent.categoryId) return null;
    definitions.push(edited.data);
  }
  if (definitions.some(({ version }) => version > row.version)) return null;
  if (new Set(definitions.map(({ version }) => version)).size !== definitions.length) return null;
  return definitions.sort((a, b) => b.version - a.version)[0]!;
}

/** Definition audit is mandatory; raw worker fixtures are not a public editable producer. */
function publicCategoryAction(row: CategoryScheduleDefinitionRow) {
  return (
    row.type === 'taxonomy.setActive' &&
    Id.safeParse(row.eventId).success &&
    Id.safeParse(row.createdByPersonId).success &&
    row.recurrence === null &&
    row.dedupeKey === null
  );
}
export function supportedCategorySchedule(
  row: CategoryScheduleDefinitionRow,
  audits: CategoryDefinitionAudit[],
) {
  if (!publicCategoryAction(row)) return null;
  const payload = Payload.safeParse(row.payload);
  const definition = auditedDefinitions(row, audits);
  if (!payload.success || !definition) return null;
  const { intent } = definition;
  if (payload.data.id !== intent.categoryId || payload.data.active !== intent.active) return null;
  if ((row.scheduledFor ?? row.runAt).toISOString() !== intent.runAt) return null;
  return definition;
}
