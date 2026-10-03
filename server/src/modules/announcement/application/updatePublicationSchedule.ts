import type { UpdateAnnouncementPublicationScheduleRequest } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';
import { toPublicationSchedule } from '../data/publicationScheduleMapper.js';
import { editPublicationSchedule } from '../data/publicationScheduleRepo.js';
import { lockPendingPublicationSchedule } from './lockPendingPublicationSchedule.js';
import type { DraftActor } from './prepareDraftMutation.js';
import { preparePublicationSchedule } from './preparePublicationSchedule.js';
import { auditPublicationScheduleEdit } from './publicationScheduleAudit.js';

export function updatePublicationSchedule(
  input: { id: string; scheduleId: string; request: UpdateAnnouncementPublicationScheduleRequest },
  actor: DraftActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const original = await lockPendingPublicationSchedule(tx, {
        ...input,
        expectedVersion: input.request.expectedVersion,
        actor,
      });
      const { draft, scope, runAt } = await preparePublicationSchedule(tx, {
        id: input.id,
        actor,
        request: {
          expectedVersion: input.request.expectedDraftVersion,
          runAt: input.request.runAt,
        },
      });
      const previous = toPublicationSchedule(original);
      if (
        original.runAt.getTime() === runAt.getTime() &&
        original.scheduledFor?.getTime() === runAt.getTime() &&
        previous.draftVersion === draft.version
      )
        return toPublicationSchedule(original);
      const row = await editPublicationSchedule(scope, {
        tx,
        id: original.id,
        version: original.version,
        draftId: draft.id,
        draftVersion: draft.version,
        runAt,
      });
      const updated = toPublicationSchedule(row);
      await auditPublicationScheduleEdit(tx, {
        audit: actor.audit,
        original: previous,
        updated,
        reason: input.request.reason,
      });
      return updated;
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
