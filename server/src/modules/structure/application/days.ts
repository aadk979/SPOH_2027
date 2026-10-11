import { ERROR_CODES, type RemoveEventDayRequest } from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import { findRemovableDay, eventHasCapture, removeDayRows } from '../data/dayRepo.js';
import { mutateStructure } from './mutation.js';

export function removeEventDay(
  input: { id: string; body: RemoveEventDayRequest },
  actor: ActorContext,
) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Change',
      key: input.body.idempotencyKey,
      auditAction: 'eventDay.remove',
      statusCode: 200,
    },
    async (tx) => {
      const day = await findRemovableDay(actor.scope, { tx, id: input.id });
      if (!day) throw new NotFoundError('Event day');
      if (
        Object.values(day._count).some((count) => count > 0) ||
        (await eventHasCapture(actor.scope, tx))
      )
        throw new ConflictError(
          ERROR_CODES.CONFLICT,
          'This event already has capture or this day has roster, briefing, attendance or announcement records. Keep the day so history stays complete.',
        );
      await removeDayRows(actor.scope, { tx, id: input.id });
      const data = { id: day.id, removed: true };
      return {
        data,
        entityType: 'EventDay',
        entityId: day.id,
        before: { date: day.date.toISOString().slice(0, 10), label: day.label },
        after: data,
      };
    },
  );
}
