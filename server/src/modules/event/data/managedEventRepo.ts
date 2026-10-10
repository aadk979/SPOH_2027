import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { shiftDate } from '../domain/cloneShift.js';

export async function lockManagedReceipt(tx: PrismaTransactionClient, key: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  return tx.idempotencyRecord.findUnique({ where: { key } });
}

export function findManagedEvent(
  tx: PrismaTransactionClient,
  input: { id: string; organisationId: string },
) {
  return tx.event.findFirst({ where: input });
}

export async function lockManagedSource(
  tx: PrismaTransactionClient,
  input: { id: string; organisationId: string },
) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${input.id} AND "organisationId" = ${input.organisationId} FOR SHARE`;
  return findManagedEvent(tx, input);
}

export async function lockManagedSlug(
  tx: PrismaTransactionClient,
  input: { organisationId: string; slug: string },
) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`${input.organisationId}/${input.slug}`}, 1))`;
  return tx.event.count({ where: { organisationId: input.organisationId, slug: input.slug } });
}

export function readOrganisationLocale(tx: PrismaTransactionClient, organisationId: string) {
  return tx.organisation.findUniqueOrThrow({
    where: { id: organisationId },
    select: { locale: true },
  });
}

export async function createEventDays(
  tx: PrismaTransactionClient,
  input: { eventId: string; startDate: string; endDate: string },
): Promise<void> {
  const dates: string[] = [];
  for (let date = input.startDate; date <= input.endDate; date = shiftDate(date, 1))
    dates.push(date);
  await tx.eventDay.createMany({
    data: dates.map((date, index) => ({
      eventId: input.eventId,
      date: new Date(`${date}T00:00:00Z`),
      label: `Day ${index + 1}`,
      isPublicDay: true,
      isTourDay: false,
    })),
  });
}

export function joinCreatedEvent(
  tx: PrismaTransactionClient,
  input: { eventId: string; personId: string; now: Date },
) {
  return tx.eventMembership.upsert({
    where: { eventId_personId: { eventId: input.eventId, personId: input.personId } },
    create: {
      eventId: input.eventId,
      personId: input.personId,
      role: 'ADMIN',
      status: 'ACTIVE',
      invitedAt: input.now,
      acceptedAt: input.now,
    },
    update: { role: 'ADMIN', status: 'ACTIVE', acceptedAt: input.now },
  });
}

export function saveManagedReceipt(
  tx: PrismaTransactionClient,
  input: {
    key: string;
    endpoint: string;
    actorSub: string;
    eventId: string;
    joined: boolean;
    fingerprint: string;
  },
) {
  return tx.idempotencyRecord.create({
    data: {
      key: input.key,
      endpoint: input.endpoint,
      actorSub: input.actorSub,
      eventId: null,
      statusCode: 201,
      responseBody: {
        eventId: input.eventId,
        joined: input.joined,
        fingerprint: input.fingerprint,
      },
    },
  });
}
