import type { PublishAnnouncementPayload } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import type { ScheduleContext } from '../../../platform/scheduler/handler.js';
import { fixedClock } from '../../../platform/time/index.js';
import { publicationAuditMetadata } from '../data/draftMapper.js';
import { recordPublication } from '../data/publicationRepo.js';
import { createAnnouncement } from '../data/repo.js';
import { prepareScheduledPublication } from './prepareScheduledPublication.js';
import { queueAnnouncementDeliveries } from './queueAnnouncementDeliveries.js';

/** The supplied scheduler transaction owns publication, delivery storage and completion. */
export async function publishScheduledDraft(
  context: ScheduleContext,
  payload: PublishAnnouncementPayload,
) {
  const { actor, draft, scope, now } = await prepareScheduledPublication(context, payload);
  const { tx } = context;
  if (draft.publication) return;
  const source = await createAnnouncement(tx, scope, {
    body: draft.body,
    priority: draft.priority,
    targetRole: draft.targetRole,
    targetStationId: draft.targetStationId,
    targetEventDayId: draft.targetEventDayId,
    requiresAck: draft.requiresAck,
    authorId: actor.volunteerId,
    expiresAt: draft.expiresAt,
    createdAt: now,
  });
  await recordPublication(scope, {
    tx,
    draftId: draft.id,
    version: draft.version,
    announcementId: source.id,
    scheduledActionId: context.action.id,
    now,
  });
  const { plan } = await queueAnnouncementDeliveries(scope, {
    tx,
    announcementId: source.id,
    audit: actor.audit,
    clock: fixedClock(now),
  });
  await writeAudit(tx, {
    ...actor.audit,
    action: 'announcement.publish',
    entityType: 'Announcement',
    entityId: source.id,
    after: publicationAuditMetadata(draft, plan),
  });
}
