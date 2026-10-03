import type { PaginationQuery } from '@spoh/shared';
import { toPage } from '../../../platform/db/pagination.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toPublicationSchedule } from '../data/publicationScheduleMapper.js';
import { listOwnPublicationSchedules } from '../data/publicationScheduleRepo.js';
import { readOwnDraft } from './readDrafts.js';
import { readPublicationSchedule } from './readPublicationSchedule.js';

export async function listPublicationSchedules(
  input: { id: string; query: PaginationQuery },
  actor: ActorContext,
) {
  await readOwnDraft(input.id, actor);
  if (input.query.cursor)
    await readPublicationSchedule({ id: input.id, scheduleId: input.query.cursor }, actor);
  const rows = await listOwnPublicationSchedules(actor.scope, {
    draftId: input.id,
    authorId: actor.volunteerId,
    page: input.query,
  });
  const page = toPage(rows, input.query.limit);
  return {
    data: page.data.map(toPublicationSchedule),
    meta: { count: page.data.length, nextCursor: page.nextCursor },
  };
}
