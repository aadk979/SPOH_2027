import { PublishAnnouncementPayload } from '@spoh/shared';
import { requireCurrentCapability } from '../../platform/access/currentCapability.js';
import { defineScheduledHandler } from '../../platform/scheduler/handler.js';
import { publishScheduledDraft } from './application/publishScheduledDraft.js';
import { scheduledPublicationActor } from './application/prepareScheduledPublication.js';

export const announcementScheduledHandlers = [
  defineScheduledHandler({
    type: 'announcement.publish',
    schema: PublishAnnouncementPayload,
    authorize: async (context) => {
      const actor = scheduledPublicationActor(context);
      await requireCurrentCapability(context.tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        capability: 'announcement.station.send',
      });
    },
    run: publishScheduledDraft,
  }),
];
