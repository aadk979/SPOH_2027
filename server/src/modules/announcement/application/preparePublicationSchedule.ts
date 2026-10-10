import {
  ERROR_CODES,
  PublishAnnouncementPayload,
  type ScheduleAnnouncementDraftRequest,
} from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { stationCandidates } from '../../../platform/access/stationCandidates.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import { findOwnDraft, lockDraftEvent } from '../data/draftRepo.js';
import { announcementScheduledHandlers } from '../jobs.js';
import { prepareDraftMutation, type DraftActor } from './prepareDraftMutation.js';

function verifyPublicationTime(
  draft: { id: string; version: number; expiresAt: Date | null },
  request: Pick<ScheduleAnnouncementDraftRequest, 'expectedVersion' | 'runAt'>,
  now: Date,
) {
  const runAt = new Date(request.runAt);
  if (runAt.getTime() <= now.getTime())
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Choose a future publication time.');
  if (draft.expiresAt && runAt.getTime() >= draft.expiresAt.getTime())
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Publication must precede the draft expiry.');
  const payload = PublishAnnouncementPayload.parse({
    draftId: draft.id,
    expectedVersion: draft.version,
  });
  const handler = announcementScheduledHandlers.find(
    (entry) => entry.type === 'announcement.publish',
  );
  if (!handler) throw new Error('Announcement publication is unavailable');
  handler.validatePayload(payload);
  return runAt;
}

export async function preparePublicationSchedule(
  tx: PrismaTransactionClient,
  input: {
    id: string;
    request: Pick<ScheduleAnnouncementDraftRequest, 'expectedVersion' | 'runAt'>;
    actor: DraftActor;
  },
) {
  const { actor, request } = input;
  await lockDraftEvent(actor.scope, tx);
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    personId: actor.volunteerId,
    membershipId: actor.membershipId,
    action: 'Announcement.SendStation',
    resource: await stationCandidates(tx, actor.scope, actor.membershipId),
  });
  const draft = await findOwnDraft(actor.scope, { id: input.id, authorId: actor.volunteerId }, tx);
  if (!draft) throw new NotFoundError('Announcement draft');
  if (draft.publication)
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Published drafts are read-only. Create a new draft for another announcement.',
    );
  if (draft.version !== request.expectedVersion)
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The draft changed. Review before scheduling again.',
    );
  const { now, scope } = await prepareDraftMutation(tx, {
    actor,
    request: {
      body: draft.body,
      priority: draft.priority,
      requiresAck: draft.requiresAck,
      target: {
        role: draft.targetRole,
        stationId: draft.targetStationId,
        eventDayId: draft.targetEventDayId,
      },
      expiresAt: draft.expiresAt?.toISOString(),
    },
  });
  const runAt = verifyPublicationTime(draft, request, now);
  return { draft, now, scope, runAt };
}
