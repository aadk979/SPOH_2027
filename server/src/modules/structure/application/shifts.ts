import type { UpdateShiftExceptionRequest } from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findShift, setShiftWindow } from '../data/templateRepo.js';
import { toShiftException } from '../data/mappers.js';
import { templateWindow } from '../domain/windows.js';
import { mutateStructure, requireStructureChange } from './mutation.js';

export function editShiftException(
  input: { id: string; body: UpdateShiftExceptionRequest },
  actor: ActorContext,
) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Edit',
      key: input.body.idempotencyKey,
      auditAction: 'shift.exception',
    },
    async (tx, timezone) => {
      const row = await findShift(actor.scope, { tx, id: input.id });
      if (!row) throw new NotFoundError('Shift');
      await requireStructureChange(actor, tx);
      const hours = input.body.operation === 'override' ? input.body : row.template;
      const window = templateWindow({
        date: row.eventDay.date.toISOString().slice(0, 10),
        timezone,
        hours,
      });
      const updated = await setShiftWindow(actor.scope, {
        tx,
        id: row.id,
        ...window,
        overridden: input.body.operation === 'override',
      });
      const data = toShiftException(updated, timezone);
      return {
        data,
        entityType: 'Shift',
        entityId: row.id,
        before: toShiftException(row, timezone),
        after: data,
      };
    },
  );
}
