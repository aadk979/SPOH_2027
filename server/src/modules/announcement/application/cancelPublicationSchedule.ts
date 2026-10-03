import type { CancelAnnouncementPublicationScheduleRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { systemClock } from '../../../platform/time/index.js';
import { toPublicationSchedule } from '../data/publicationScheduleMapper.js';
import { cancelPublicationSchedule as cancelRow } from '../data/publicationScheduleRepo.js';
import { lockPendingPublicationSchedule } from './lockPendingPublicationSchedule.js';
import type { DraftActor } from './prepareDraftMutation.js';

export function cancelPublicationSchedule(
  input: { id: string; scheduleId: string; request: CancelAnnouncementPublicationScheduleRequest },
  actor: DraftActor,
) {
  return prisma.$transaction(
    async (tx) => {
      const original = await lockPendingPublicationSchedule(tx, {
        ...input,
        expectedVersion: input.request.expectedVersion,
        actor,
      });
      const now = (actor.clock ?? systemClock).now();
      const row = await cancelRow(actor.scope, {
        tx,
        id: original.id,
        version: original.version,
        now,
      });
      await writeAudit(tx, {
        ...actor.audit,
        action: 'schedule.cancel',
        entityType: 'ScheduledAction',
        entityId: row.id,
        before: { status: original.status, version: original.version },
        after: {
          status: row.status,
          version: row.version,
          ...(input.request.reason ? { reason: input.request.reason } : {}),
        },
      });
      return toPublicationSchedule(row);
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
