import { FullReport, zonedDayWindow, type ReportQuery } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { writeAudit } from '../../../platform/audit/index.js';
import { ScheduleRefusal } from '../../../platform/scheduler/failure.js';
import { fixedClock } from '../../../platform/time/index.js';
import { dailySnapshotContext, saveDailySnapshot } from '../data/dailySnapshotRepo.js';
import { generateReportInTransaction } from './generateReport.js';

/** Completed operational days use wall-clock boundaries, including 23/25-hour DST days. */
function completedDayQuery(input: {
  date: Date;
  timezone: string;
  dayBoundaryMinutes: number;
  includeRehearsal: boolean;
  now: Date;
}): ReportQuery {
  try {
    const { start, end } = zonedDayWindow(
      input.date.toISOString().slice(0, 10),
      input.timezone,
      input.dayBoundaryMinutes,
    );
    if (input.now < end) throw new ScheduleRefusal('GUARD_FAILED');
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      includeRehearsal: input.includeRehearsal,
    };
  } catch (error) {
    if (error instanceof RangeError) throw new ScheduleRefusal('GUARD_FAILED');
    throw error;
  }
}

/** The worker supplies its locked Event and transaction; FINAL documents stay owned by close-out. */
export async function createDailySnapshot(
  tx: PrismaTransactionClient,
  input: {
    actor: ActorContext;
    eventDayId: string;
    includeRehearsal: boolean;
    actionId: string;
    now: Date;
  },
) {
  const { actor, eventDayId, now } = input;
  const { event, day } = await dailySnapshotContext(tx, actor.scope, eventDayId);
  if (!day) throw new ScheduleRefusal('TARGET_MISSING');
  if (event.status === 'ARCHIVED') throw new ScheduleRefusal('GUARD_FAILED');
  const query = completedDayQuery({ ...input, ...event, date: day.date });
  const report = FullReport.parse(
    await generateReportInTransaction(tx, actor.scope, { query, clock: fixedClock(now) }),
  );
  const snapshot = await saveDailySnapshot(tx, actor.scope, {
    report,
    lifecycleVersion: event.lifecycleVersion,
    personId: actor.volunteerId,
    actionId: input.actionId,
    createdAt: now,
  });
  await writeAudit(tx, {
    ...actor.audit,
    action: 'report.snapshot',
    entityType: 'ReportSnapshot',
    entityId: snapshot.id,
    after: {
      kind: 'DAILY',
      eventDayId,
      range: report.range,
      lifecycleVersion: event.lifecycleVersion,
      rehearsalIncluded: report.rehearsalIncluded,
    },
  });
  return snapshot.id;
}
