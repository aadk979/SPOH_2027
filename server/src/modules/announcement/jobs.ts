import { PublishAnnouncementPayload } from '@spoh/shared';
import { requireCurrentPermission } from '../../platform/access/currentPermission.js';
import { stationCandidates } from '../../platform/access/stationCandidates.js';
import { defineScheduledHandler } from '../../platform/scheduler/handler.js';
import { publishScheduledDraft } from './application/publishScheduledDraft.js';
import { scheduledPublicationActor } from './application/prepareScheduledPublication.js';

export const announcementScheduledHandlers = [
  defineScheduledHandler({
    type: 'announcement.publish',
    schema: PublishAnnouncementPayload,
    authorize: async (context) => {
      const actor = scheduledPublicationActor(context);
      await requireCurrentPermission(context.tx, {
        scope: actor.scope,
        membershipId: actor.membershipId,
        personId: actor.volunteerId,
        action: 'Announcement.SendStation',
        resource: await stationCandidates(context.tx, actor.scope, actor.membershipId),
      });
    },
    run: publishScheduledDraft,
  }),
];
