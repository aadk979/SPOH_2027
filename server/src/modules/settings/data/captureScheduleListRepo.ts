import type { CaptureScheduleListQuery } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { CaptureScheduleRow } from './captureScheduleRepo.js';

function captureTargetFilter(
  scope: EventScope,
  query: CaptureScheduleListQuery,
): Prisma.ScheduledActionWhereInput {
  return {
    eventId: scope.eventId,
    type: 'setting.apply',
    recurrence: null,
    dedupeKey: null,
    createdByPersonId: { not: null },
    AND: [
      { payload: { path: ['scope'], equals: query.scope } },
      {
        payload: {
          path: ['scopeId'],
          equals: query.scope === 'event' ? scope.eventId : query.stationId!,
        },
      },
      { payload: { path: ['key'], equals: query.key } },
    ],
  };
}
/** Cursor ownership deliberately excludes the mutable status filter. */
export function captureListCursor(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { id: string; query: CaptureScheduleListQuery },
) {
  return tx.scheduledAction.findFirst({
    where: { ...captureTargetFilter(scope, input.query), id: input.id },
    select: { id: true, createdAt: true },
  });
}
export function captureListRows(
  tx: PrismaTransactionClient,
  scope: EventScope,
  input: { query: CaptureScheduleListQuery; cursor: { id: string; createdAt: Date } | null },
) {
  const { query, cursor } = input;
  return tx.scheduledAction.findMany({
    where: {
      ...captureTargetFilter(scope, query),
      ...(query.status ? { status: query.status } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
}
/** Load immutable provenance once for the page, without per-row queries. */
export function captureListCreationAudits(
  tx: PrismaTransactionClient,
  scope: EventScope,
  rows: CaptureScheduleRow[],
) {
  return tx.auditLog.findMany({
    where: {
      eventId: scope.eventId,
      action: 'schedule.create',
      entityType: 'ScheduledAction',
      source: 'USER',
      entityId: { in: rows.map(({ id }) => id) },
    },
    select: { entityId: true, actorId: true, after: true },
  });
}
