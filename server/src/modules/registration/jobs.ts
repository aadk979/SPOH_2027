import { Id } from '@spoh/shared';
import { z } from 'zod';
import { requireCurrentCapability } from '../../platform/access/currentCapability.js';
import { ScheduleRefusal } from '../../platform/scheduler/failure.js';
import { defineScheduledHandler, type ScheduleContext } from '../../platform/scheduler/handler.js';
import { setCategoryActive } from './application/setCategoryActive.js';

/** Station/type activity has further consumers; only the verified category contract is enabled. */
const categoryActivityPayload = z
  .object({ kind: z.literal('category'), id: Id, active: z.boolean() })
  .strict();

function categoryActor(context: ScheduleContext) {
  const { eventId, createdByPersonId } = context.action;
  const { membershipId } = context.audit;
  if (eventId === null || createdByPersonId === null || membershipId === null) {
    throw new ScheduleRefusal('AUTHORITY_CHANGED');
  }
  return { scope: { eventId }, personId: createdByPersonId, membershipId };
}

export const registrationScheduledHandlers = [
  defineScheduledHandler({
    type: 'taxonomy.setActive',
    schema: categoryActivityPayload,
    authorize: async (context) => {
      await requireCurrentCapability(context.tx, {
        ...categoryActor(context),
        capability: 'config.manage',
      });
    },
    run: async (context, payload) => {
      await setCategoryActive(context.tx, {
        scope: categoryActor(context).scope,
        id: payload.id,
        active: payload.active,
        now: context.now,
        audit: context.audit,
      });
    },
  }),
];
