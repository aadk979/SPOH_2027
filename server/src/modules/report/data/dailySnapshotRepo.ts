import type { FullReport } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export async function dailySnapshotContext(
  tx: PrismaTransactionClient,
  scope: EventScope,
  eventDayId: string,
) {
  const event = await tx.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { status: true, lifecycleVersion: true, timezone: true, dayBoundaryMinutes: true },
  });
  const day = await tx.eventDay.findFirst({
    where: { eventId: scope.eventId, id: eventDayId },
    select: { date: true },
  });
  return { event, day };
}

export async function saveDailySnapshot(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: {
    report: FullReport;
    lifecycleVersion: number;
    personId: string;
    actionId: string;
    createdAt: Date;
  },
) {
  return tx.reportSnapshot.create({
    data: {
      eventId: scope.eventId,
      kind: 'DAILY',
      lifecycleVersion: input.lifecycleVersion,
      dedupeKey: `daily:scheduled:${input.actionId}`,
      rehearsalIncluded: input.report.rehearsalIncluded,
      report: input.report,
      createdByPersonId: input.personId,
      createdAt: input.createdAt,
    },
    select: { id: true },
  });
}
