import type { EventSettingKey, EventStatus } from '@spoh/shared';
import type { Prisma } from '../../../generated/prisma/client.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** The display name of whoever last changed the settings. */
export async function findVolunteerName(id: string): Promise<string | null> {
  const row = await prisma.person.findUnique({ where: { id }, select: { displayName: true } });
  return row?.displayName ?? null;
}

export async function eventStatusOf(
  tx: PrismaTransactionClient,
  scope: EventScope,
): Promise<EventStatus> {
  const event = await tx.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { status: true },
  });
  return event.status;
}

/** A station of the event, and whether its type counts entries. */
export async function findStationCounting(
  tx: PrismaTransactionClient,
  scope: EventScope,
  stationId: string,
): Promise<{ countsEntry: boolean } | null> {
  const station = await tx.station.findFirst({
    where: { eventId: scope.eventId, id: stationId },
    select: { type: { select: { countsEntry: true } } },
  });
  return station ? { countsEntry: station.type.countsEntry } : null;
}

/**
 * Store the next version of an event setting, only if it is still at the one
 * the caller read. False when someone else got there first (ADR-003 §2).
 */
export async function writeEventSetting(
  tx: PrismaTransactionClient,
  scope: EventScope,
  write: { key: EventSettingKey; value: unknown; readVersion: number; personId: string },
): Promise<boolean> {
  const { eventId } = scope;
  const value = write.value as Prisma.InputJsonValue;
  if (write.readVersion === 0) {
    const created = await tx.setting.createMany({
      data: [
        {
          scope: 'EVENT',
          scopeId: eventId,
          eventId,
          key: write.key,
          value,
          version: 1,
          updatedByPersonId: write.personId,
        },
      ],
      skipDuplicates: true,
    });
    return created.count === 1;
  }
  const updated = await tx.setting.updateMany({
    where: { scope: 'EVENT', scopeId: eventId, key: write.key, version: write.readVersion },
    data: { value, version: write.readVersion + 1, updatedByPersonId: write.personId },
  });
  return updated.count === 1;
}

/** The history row of a change: append-only (ADR-003 §2). */
export async function appendSettingChange(
  tx: PrismaTransactionClient,
  scope: EventScope,
  change: {
    key: EventSettingKey;
    version: number;
    before: unknown;
    after: unknown;
    reason: string | null;
    personId: string;
  },
): Promise<void> {
  const { eventId } = scope;
  await tx.settingChange.create({
    data: {
      scope: 'EVENT',
      scopeId: eventId,
      eventId,
      key: change.key,
      version: change.version,
      before: change.before as Prisma.InputJsonValue,
      after: change.after as Prisma.InputJsonValue,
      reason: change.reason,
      source: 'USER',
      actorPersonId: change.personId,
    },
  });
}
