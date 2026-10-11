import {
  ERROR_CODES,
  type CreateManagedTemplateRequest,
  type ManagedShiftTemplate,
  type UpdateManagedTemplateRequest,
} from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import * as repo from '../data/templateRepo.js';
import { templateWindow, validateShiftHours } from '../domain/windows.js';
import { mutateStructure, requireStructureChange } from './mutation.js';

async function populateTemplate(
  input: { tx: PrismaTransactionClient; actor: ActorContext; timezone: string },
  template: ManagedShiftTemplate,
) {
  const days = await repo.listDays(input.actor.scope, input.tx);
  const rows = days.map((day) => ({
    eventDayId: day.id,
    templateId: template.id,
    ...templateWindow({
      date: day.date.toISOString().slice(0, 10),
      timezone: input.timezone,
      hours: template,
    }),
  }));
  await repo.insertTemplateShifts(input.actor.scope, { tx: input.tx, rows });
}
export function createManagedTemplate(body: CreateManagedTemplateRequest, actor: ActorContext) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Change',
      key: body.idempotencyKey,
      auditAction: 'shiftTemplate.create',
    },
    async (tx, timezone) => {
      const data = await repo.createTemplate(actor.scope, { tx, body });
      await populateTemplate({ tx, actor, timezone }, data);
      return { data, entityType: 'ShiftTemplate', entityId: data.id, after: data };
    },
  );
}
async function syncTemplateShifts(
  input: { tx: PrismaTransactionClient; actor: ActorContext; timezone: string },
  template: ManagedShiftTemplate,
) {
  const { scope } = input.actor;
  const shifts = await repo.listTemplateShifts(scope, { tx: input.tx, id: template.id });
  if (!template.active) {
    if (shifts.some((shift) => shift._count.assignments > 0))
      throw new ConflictError(
        ERROR_CODES.CONFLICT,
        'Unassign this template’s shifts before deactivating it.',
      );
    await repo.removeTemplateShifts(scope, { tx: input.tx, id: template.id });
    return;
  }
  await populateTemplate(input, template);
  for (const shift of shifts.filter((row) => !row.overridden)) {
    await repo.setShiftWindow(scope, {
      tx: input.tx,
      id: shift.id,
      overridden: false,
      ...templateWindow({
        date: shift.eventDay.date.toISOString().slice(0, 10),
        timezone: input.timezone,
        hours: template,
      }),
    });
  }
}
export function editManagedTemplate(
  input: { id: string; body: UpdateManagedTemplateRequest },
  actor: ActorContext,
) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Edit',
      key: input.body.idempotencyKey,
      auditAction: 'shiftTemplate.update',
    },
    async (tx, timezone) => {
      const before = await repo.findTemplate(actor.scope, { tx, id: input.id });
      if (!before) throw new NotFoundError('Shift template');
      const fields = ['startLocal', 'endLocal', 'endsNextDay'] as const;
      if (
        fields.some((key) => input.body[key] !== undefined && input.body[key] !== before[key]) ||
        (input.body.active === true && !before.active)
      )
        await requireStructureChange(actor, tx);
      const hours = { ...before, ...input.body };
      // Validate partial edits against the retained fields before any shifts are changed.
      validateShiftHours(hours);
      const data = await repo.updateTemplate(actor.scope, { tx, ...input });
      await syncTemplateShifts({ tx, actor, timezone }, data);
      return { data, entityType: 'ShiftTemplate', entityId: data.id, before, after: data };
    },
  );
}
