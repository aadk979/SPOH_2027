import {
  ScheduleMutationResponse,
  type CreateLifecycleScheduleRequest,
  type CreateReportScheduleRequest,
} from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { systemClock } from '../../../platform/time/index.js';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { requireEventDay } from '../../eventDays/index.js';
import { requireLifecycleScheduleEdge } from '../../event/index.js';
import { toTimelineRecord } from '../data/mapper.js';
import {
  insertUserSchedule,
  type ProducedPayload,
  type ProducedType,
} from '../data/producerRepo.js';
import {
  requireFutureRunAt,
  requireScheduleManager,
  type ScheduleActor,
} from './scheduleAuthority.js';

const TRANSACTION = { isolationLevel: 'ReadCommitted', timeout: 30_000 } as const;

/** Insert, audit and answer: the part both producers share once their own checks passed. */
async function recordSchedule(
  tx: PrismaTransactionClient,
  input: { actor: ScheduleActor; type: ProducedType; payload: ProducedPayload; runAt: Date; now: Date },
) {
  const { actor, type, payload, runAt, now } = input;
  const row = await insertUserSchedule(tx, actor.scope, {
    type,
    payload,
    runAt,
    personId: actor.volunteerId,
    now,
  });
  await writeAudit(tx, {
    ...actor.audit,
    source: 'USER',
    action: 'schedule.create',
    entityType: 'ScheduledAction',
    entityId: row.id,
    after: { type, runAt: runAt.toISOString(), payload },
  });
  return ScheduleMutationResponse.parse({ schedule: toTimelineRecord(row, actor.volunteerId) });
}

/** A timed transition, reviewed against the version the requester saw (ADR-004 §4). */
export function createLifecycleSchedule(
  request: CreateLifecycleScheduleRequest,
  actor: ScheduleActor,
) {
  return prisma.$transaction(async (tx) => {
    // The exclusive event lock first: taking the shared one and upgrading could deadlock.
    await requireLifecycleScheduleEdge(tx, {
      actor,
      to: request.to,
      expectedVersion: request.expectedVersion,
    });
    await requireScheduleManager(tx, actor);
    const now = (actor.clock ?? systemClock).now();
    const runAt = requireFutureRunAt(request.runAt, now);
    const payload = {
      to: request.to,
      expectedVersion: request.expectedVersion,
      ...(request.reason ? { reason: request.reason } : {}),
    };
    return recordSchedule(tx, { actor, type: 'event.transition', payload, runAt, now });
  }, TRANSACTION);
}

/** A daily snapshot taken at a chosen time, by the report's own use case when it runs. */
export function createReportSchedule(request: CreateReportScheduleRequest, actor: ScheduleActor) {
  return prisma.$transaction(async (tx) => {
    await requireScheduleManager(tx, actor);
    await requireCurrentPermission(tx, {
      scope: actor.scope,
      membershipId: actor.membershipId,
      personId: actor.volunteerId,
      action: 'Report.Generate',
    });
    await requireEventDay(actor.scope, request.eventDayId);
    const now = (actor.clock ?? systemClock).now();
    const runAt = requireFutureRunAt(request.runAt, now);
    const payload = {
      kind: 'daily',
      eventDayId: request.eventDayId,
      includeRehearsal: request.includeRehearsal,
    };
    return recordSchedule(tx, { actor, type: 'report.snapshot', payload, runAt, now });
  }, TRANSACTION);
}
