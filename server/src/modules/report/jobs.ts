import { Id } from '@spoh/shared';
import { z } from 'zod';
import { requireCurrentPermission } from '../../platform/access/currentPermission.js';
import type { ActorContext } from '../../platform/http/auditContext.js';
import { ScheduleRefusal } from '../../platform/scheduler/failure.js';
import { defineScheduledHandler, type ScheduleContext } from '../../platform/scheduler/handler.js';
import { createDailySnapshot } from './application/createDailySnapshot.js';

/** One-off user daily snapshots only; close-out owns FINAL and automatic declarations come later. */
const dailySnapshotPayload = z
  .object({
    kind: z.literal('daily'),
    eventDayId: Id,
    includeRehearsal: z.boolean().default(false),
  })
  .strict();

function snapshotActor(context: ScheduleContext): ActorContext {
  const { eventId, createdByPersonId } = context.action;
  const { membershipId } = context.audit;
  if (eventId === null || createdByPersonId === null || membershipId === null) {
    throw new ScheduleRefusal('AUTHORITY_CHANGED');
  }
  return {
    scope: { eventId },
    volunteerId: createdByPersonId,
    membershipId,
    audit: context.audit,
  };
}

export const reportScheduledHandlers = [
  defineScheduledHandler({
    type: 'report.snapshot',
    schema: dailySnapshotPayload,
    authorize: async (context) => {
      const actor = snapshotActor(context);
      await requireCurrentPermission(context.tx, {
        scope: actor.scope,
        personId: actor.volunteerId,
        membershipId: actor.membershipId,
        action: 'Report.Generate',
      });
    },
    run: async (context, payload) => {
      await createDailySnapshot(context.tx, {
        actor: snapshotActor(context),
        eventDayId: payload.eventDayId,
        includeRehearsal: payload.includeRehearsal,
        actionId: context.action.id,
        now: context.now,
      });
    },
  }),
];
