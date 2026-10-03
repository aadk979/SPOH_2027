import type { ScheduleAnnouncementDraftRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { toPublicationSchedule } from '../data/publicationScheduleMapper.js';
import { insertPublicationSchedule } from '../data/publicationScheduleRepo.js';
import type { DraftActor } from './prepareDraftMutation.js';
import { preparePublicationSchedule } from './preparePublicationSchedule.js';

/** Current creation authority, action, metadata audit and id-only retry receipt share a commit. */
export function createPublicationSchedule(
  input: { id: string; request: ScheduleAnnouncementDraftRequest },
  actor: DraftActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const { draft, now, scope, runAt } = await preparePublicationSchedule(tx, {
        ...input,
        actor,
      });
      await lockReserved(tx, scope, input.request.idempotencyKey);
      const row = await insertPublicationSchedule(scope, {
        tx,
        draftId: draft.id,
        version: draft.version,
        authorId: actor.volunteerId,
        runAt,
        now,
      });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'schedule.create',
        entityType: 'ScheduledAction',
        entityId: row.id,
        after: {
          type: row.type,
          draftId: draft.id,
          draftVersion: draft.version,
          runAt: runAt.toISOString(),
        },
      });
      await settleReserved(tx, scope, {
        key: input.request.idempotencyKey,
        statusCode: 201,
        body: { scheduledActionId: row.id, draftId: draft.id },
      });
      return toPublicationSchedule(row);
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
