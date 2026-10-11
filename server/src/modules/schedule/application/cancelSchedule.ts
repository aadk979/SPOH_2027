import { ERROR_CODES, ScheduleMutationResponse, type CancelScheduleRequest } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import { systemClock } from '../../../platform/time/index.js';
import { toTimelineRecord } from '../data/mapper.js';
import { lockProducedSchedule, markScheduleCancelled } from '../data/producerRepo.js';
import { requireScheduleManager, type ScheduleActor } from './scheduleAuthority.js';

/**
 * Any schedule manager may cancel a pending lifecycle or report schedule: the point of a
 * shared timeline is that a colleague can stop a mistaken one while its author is asleep.
 */
export function cancelSchedule(
  input: { id: string; request: CancelScheduleRequest },
  actor: ScheduleActor,
) {
  return prisma.$transaction(
    async (tx) => {
      await requireScheduleManager(tx, actor);
      const row = await lockProducedSchedule(tx, actor.scope, input.id);
      if (!row) throw new NotFoundError('Scheduled action');
      if (row.status !== 'PENDING' || row.version !== input.request.expectedVersion) {
        throw new ConflictError(
          ERROR_CODES.CONFLICT,
          'This schedule already ran or changed. Reload the schedule.',
        );
      }
      const now = (actor.clock ?? systemClock).now();
      const cancelled = await markScheduleCancelled(tx, actor.scope, {
        id: row.id,
        version: row.version,
        now,
      });
      await writeAudit(tx, {
        ...actor.audit,
        source: 'USER',
        action: 'schedule.cancel',
        entityType: 'ScheduledAction',
        entityId: row.id,
        before: { status: row.status, version: row.version },
        after: { status: cancelled.status, version: cancelled.version },
      });
      return ScheduleMutationResponse.parse({
        schedule: toTimelineRecord(cancelled, actor.volunteerId),
      });
    },
    { isolationLevel: 'ReadCommitted', timeout: 30_000 },
  );
}
