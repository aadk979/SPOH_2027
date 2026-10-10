import { ERROR_CODES, PublishAnnouncementPayload } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { stationCandidates } from '../../../platform/access/stationCandidates.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import { findOwnDraft, lockDraftEvent } from '../data/draftRepo.js';
import { lockOwnPublicationSchedule } from '../data/publicationScheduleRepo.js';
import type { DraftActor } from './prepareDraftMutation.js';

/** Event then action, matching execution. Only an owned user one-off still PENDING can change. */
export async function lockPendingPublicationSchedule(
  tx: PrismaTransactionClient,
  input: { id: string; scheduleId: string; expectedVersion: number; actor: DraftActor },
) {
  const { actor } = input;
  const { scope } = actor;
  if ((await lockDraftEvent(scope, tx)).status === 'ARCHIVED')
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived schedules are read-only.');
  await requireCurrentPermission(tx, {
    scope,
    personId: actor.volunteerId,
    membershipId: actor.membershipId,
    action: 'Announcement.SendStation',
    resource: await stationCandidates(tx, scope, actor.membershipId),
  });
  if (!(await findOwnDraft(scope, { id: input.id, authorId: actor.volunteerId }, tx)))
    throw new NotFoundError('Announcement draft');
  const row = await lockOwnPublicationSchedule(scope, {
    tx,
    id: input.scheduleId,
    draftId: input.id,
    authorId: actor.volunteerId,
  });
  if (
    !row ||
    !PublishAnnouncementPayload.safeParse(row.payload).success ||
    row.recurrence !== null ||
    row.dedupeKey !== null
  )
    throw new NotFoundError('Announcement schedule');
  if (row.version !== input.expectedVersion)
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The schedule changed. Reload before trying again.',
    );
  if (row.status !== 'PENDING')
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Only pending schedules can be changed.');
  return row;
}
