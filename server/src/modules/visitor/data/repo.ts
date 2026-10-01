import type { CommitteeRole, CreateVisitorFieldRequest } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { rehearsalFilter, type ReportingScope } from '../../../platform/db/rehearsalFilter.js';

/**
 * Data access for visitor fields and records (ADR-002 §4). The values live
 * here and nowhere else; every query names its event (ADR-001 §2).
 */

const FIELD = {
  id: true,
  code: true,
  label: true,
  type: true,
  classification: true,
  retentionDays: true,
  readers: true,
  sortOrder: true,
  active: true,
} satisfies Prisma.VisitorFieldSelect;

/** Turning collection off owns an exclusive lock before purging values. */
export async function lockVisitorEvent(
  tx: PrismaTransactionClient,
  scope: EventScope,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${scope.eventId} FOR UPDATE`;
}

/** Captures may run together while holding collection mode stable against switch-off. */
export async function holdVisitorMode(
  tx: PrismaTransactionClient,
  scope: EventScope,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${scope.eventId} FOR SHARE`;
}

export type FieldRow = Prisma.VisitorFieldGetPayload<{ select: typeof FIELD }>;

export async function listFieldRows(
  scope: EventScope,
  db: PrismaTransactionClient = prisma,
): Promise<FieldRow[]> {
  return db.visitorField.findMany({
    where: { eventId: scope.eventId },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: FIELD,
  });
}

export async function findFieldRow(scope: EventScope, id: string): Promise<FieldRow | null> {
  return prisma.visitorField.findFirst({ where: { eventId: scope.eventId, id }, select: FIELD });
}

export async function findFieldByCode(scope: EventScope, code: string) {
  return prisma.visitorField.findFirst({
    where: { eventId: scope.eventId, code },
    select: { id: true },
  });
}

export async function createFieldRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  data: CreateVisitorFieldRequest,
): Promise<FieldRow> {
  return tx.visitorField.create({ data: { ...data, eventId: scope.eventId }, select: FIELD });
}

export async function updateFieldRow(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: {
    id: string;
    data: Partial<{ label: string; retentionDays: number; readers: CommitteeRole[] }> &
      Partial<{ sortOrder: number; active: boolean }>;
  },
): Promise<FieldRow> {
  return tx.visitorField.update({
    where: { id: change.id, eventId: scope.eventId },
    data: change.data,
    select: FIELD,
  });
}

export async function createVisitorRecord(
  tx: PrismaTransactionClient,
  scope: EventScope,
  record: { registrationId: string; data: Record<string, string> },
): Promise<void> {
  const parent = await tx.registration.findUniqueOrThrow({
    where: { eventId: scope.eventId, id: record.registrationId },
    select: { rehearsal: true },
  });
  await tx.visitorRecord.create({ data: { ...record, ...parent, eventId: scope.eventId } });
}

/** Records in a window, oldest first, with when their registration was made. */
export async function listRecordRows(scope: ReportingScope, window: { from: Date; to: Date }) {
  return prisma.visitorRecord.findMany({
    where: {
      eventId: scope.eventId,
      ...rehearsalFilter(scope),
      registration: {
        eventId: scope.eventId,
        ...rehearsalFilter(scope),
        recordedAt: { gte: window.from, lt: window.to },
      },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      registrationId: true,
      rehearsal: true,
      data: true,
      registration: { select: { recordedAt: true } },
    },
  });
}

/** Every record of the event: switching visitor data off purges them (ADR-002 §4). */
export async function deleteAllRecords(
  tx: PrismaTransactionClient,
  scope: EventScope,
): Promise<number> {
  const { count } = await tx.visitorRecord.deleteMany({ where: { eventId: scope.eventId } });
  return count;
}

/**
 * One field's values removed from every record of the event, then any record
 * left with no values; the registrations, and so every count, stay.
 */
export async function purgeFieldValues(
  tx: PrismaTransactionClient,
  scope: EventScope,
  code: string,
): Promise<number> {
  const cleared = await tx.$executeRaw`
    UPDATE "VisitorRecord" SET "data" = "data" - ${code}
    WHERE "eventId" = ${scope.eventId} AND "data" ? ${code}`;
  await tx.$executeRaw`
    DELETE FROM "VisitorRecord" WHERE "eventId" = ${scope.eventId} AND "data" = '{}'::jsonb`;
  return cleared;
}

/** The last value's deadline is the record's purgeAfter (ADR-002 §4). */
export async function syncPurgeDeadlines(
  tx: PrismaTransactionClient,
  scope: EventScope,
  closedAt: Date,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "VisitorRecord" AS record
    SET "purgeAfter" = ${closedAt}::timestamptz +
      (SELECT MAX(field."retentionDays") FROM "VisitorField" AS field
       WHERE field."eventId" = ${scope.eventId} AND record."data" ? field."code") * INTERVAL '1 day'
    WHERE record."eventId" = ${scope.eventId}`;
}

/** The deadline is a backstop even if an individual field purge was delayed. */
export async function deleteDueRecords(
  tx: PrismaTransactionClient,
  scope: EventScope,
  now: Date,
): Promise<number> {
  const { count } = await tx.visitorRecord.deleteMany({
    where: { eventId: scope.eventId, purgeAfter: { lte: now } },
  });
  return count;
}

/** Events that have closed: their visitor values are counting down. */
export async function findClosedEvents(): Promise<Array<{ id: string; closedAt: Date }>> {
  const events = await prisma.event.findMany({
    where: { closedAt: { not: null } },
    select: { id: true, closedAt: true },
  });
  return events.flatMap((event) =>
    event.closedAt ? [{ id: event.id, closedAt: event.closedAt }] : [],
  );
}
