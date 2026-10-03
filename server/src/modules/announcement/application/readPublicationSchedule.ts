import { PublishAnnouncementPayload } from '@spoh/shared';
import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toPublicationSchedule } from '../data/publicationScheduleMapper.js';
import { findOwnPublicationSchedule } from '../data/publicationScheduleRepo.js';
import { readOwnDraft } from './readDrafts.js';

export async function readPublicationSchedule(
  input: { id: string; scheduleId: string },
  actor: ActorContext,
) {
  await readOwnDraft(input.id, actor);
  const row = await findOwnPublicationSchedule(actor.scope, {
    id: input.scheduleId,
    draftId: input.id,
    authorId: actor.volunteerId,
  });
  if (!row || !PublishAnnouncementPayload.safeParse(row.payload).success)
    throw new NotFoundError('Announcement schedule');
  return toPublicationSchedule(row);
}
