import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { Audience } from '../domain/audience.js';
import { audienceMembershipWhere } from './audienceWhere.js';

export async function lockDeliveryEvent(scope: EventScope, tx: PrismaTransactionClient) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return tx.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { status: true, timezone: true, dayBoundaryMinutes: true },
  });
}

export function findDeliverySource(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; announcementId: string },
) {
  return input.tx.announcement.findFirst({
    where: { eventId: scope.eventId, id: input.announcementId },
    select: {
      id: true,
      priority: true,
      targetRole: true,
      targetStationId: true,
      targetEventDayId: true,
      createdAt: true,
      expiresAt: true,
    },
  });
}

export function findDeliveryPlan(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; announcementId: string },
) {
  return input.tx.announcementDeliveryPlan.findFirst({
    where: { eventId: scope.eventId, announcementId: input.announcementId },
  });
}

export function findDeliveryRecipients(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; audience: Audience; today: Date },
) {
  return input.tx.eventMembership.findMany({
    where: audienceMembershipWhere(scope, input),
    select: {
      id: true,
      personId: true,
      person: { select: { pushSubscriptions: { select: { id: true } } } },
    },
  });
}

export type DeliveryRecipients = Awaited<ReturnType<typeof findDeliveryRecipients>>;

export function createDeliveryPlan(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    announcementId: string;
    recipients: DeliveryRecipients;
    now: Date;
    deadlineMs: number;
  },
) {
  return input.tx.announcementDeliveryPlan.create({
    data: {
      eventId: scope.eventId,
      announcementId: input.announcementId,
      recipientCount: input.recipients.length,
      deviceCount: input.recipients.reduce(
        (count, row) => count + row.person.pushSubscriptions.length,
        0,
      ),
      createdAt: input.now,
      expiresAt: new Date(input.deadlineMs),
    },
  });
}

export function createDeviceDeliveries(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    planId: string;
    recipients: DeliveryRecipients;
    now: Date;
  },
) {
  const data = input.recipients.flatMap((member) =>
    member.person.pushSubscriptions.map((device) => ({
      eventId: scope.eventId,
      planId: input.planId,
      recipientPersonId: member.personId,
      recipientMembershipId: member.id,
      subscriptionId: device.id,
      deviceKey: device.id,
      runAt: input.now,
      createdAt: input.now,
    })),
  );
  return input.tx.announcementPushDelivery.createMany({ data });
}
