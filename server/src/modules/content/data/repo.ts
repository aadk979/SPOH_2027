import type { EventContent } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { Prisma } from '../../../generated/prisma/client.js';

export async function lockContentEvent(scope: EventScope, tx: PrismaTransactionClient) {
  await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { status: true } });
}
export const draftRow = (
  scope: EventScope,
  tx: Pick<PrismaTransactionClient, 'contentDocument'> = prisma,
) => tx.contentDocument.findFirst({ where: { eventId: scope.eventId } });
export const versionRows = (scope: EventScope) =>
  prisma.contentVersion.findMany({
    where: { eventId: scope.eventId },
    orderBy: { version: 'desc' },
    take: 50,
  });
export async function publishedRow(
  scope: EventScope,
  input: { id?: string },
  tx: PrismaTransactionClient = prisma,
) {
  const id = input.id ?? (await draftRow(scope, tx))?.publishedVersionId;
  return id ? tx.contentVersion.findFirst({ where: { eventId: scope.eventId, id } }) : null;
}
export async function saveDraftRow(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    body: EventContent;
    personId: string;
    now: Date;
    version: number;
  },
) {
  const data = {
    body: input.body as Prisma.InputJsonValue,
    updatedAt: input.now,
    updatedByPersonId: input.personId,
    reviewedVersion: null,
    reviewedAt: null,
    reviewedByPersonId: null,
  };
  return input.tx.contentDocument.upsert({
    where: { eventId: scope.eventId },
    create: { eventId: scope.eventId, ...data, version: 1 },
    update: { ...data, version: input.version + 1 },
  });
}
export const reviewDraftRow = (
  scope: EventScope,
  input: { tx: PrismaTransactionClient; personId: string; now: Date; version: number },
) =>
  input.tx.contentDocument.update({
    where: { eventId: scope.eventId },
    data: {
      reviewedVersion: input.version,
      reviewedAt: input.now,
      reviewedByPersonId: input.personId,
    },
  });
export async function contentReferenceCounts(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; tags: string[]; stations: string[] },
) {
  return {
    tags: await input.tx.stationTag.count({
      where: { eventId: scope.eventId, id: { in: input.tags } },
    }),
    stations: await input.tx.station.count({
      where: { eventId: scope.eventId, id: { in: input.stations } },
    }),
  };
}
export const imageReceipts = (
  scope: EventScope,
  input: { tx: PrismaTransactionClient; keys: string[] },
) =>
  input.tx.contentUploadReceipt.findMany({
    where: { eventId: scope.eventId, key: { in: input.keys } },
  });
export const ownedImageReceipt = (
  scope: EventScope,
  input: { tx: PrismaTransactionClient; key: string; personId: string },
) =>
  input.tx.contentUploadReceipt.findFirst({
    where: { eventId: scope.eventId, key: input.key, issuedByPersonId: input.personId },
  });
export const insertImageReceipt = (
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    id: string;
    key: string;
    contentType: string;
    contentLength: number;
    personId: string;
    now: Date;
  },
) =>
  input.tx.contentUploadReceipt.create({
    data: {
      eventId: scope.eventId,
      id: input.id,
      key: input.key,
      contentType: input.contentType,
      contentLength: input.contentLength,
      issuedByPersonId: input.personId,
      createdAt: input.now,
    },
  });
export async function insertContentVersion(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    id: string;
    draftVersion: number;
    body: EventContent;
    objectKey: string;
    etag: string;
    personId: string;
    now: Date;
  },
) {
  const latest = await input.tx.contentVersion.findFirst({
    where: { eventId: scope.eventId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const row = await input.tx.contentVersion.create({
    data: {
      eventId: scope.eventId,
      id: input.id,
      version: (latest?.version ?? 0) + 1,
      draftVersion: input.draftVersion,
      body: input.body as Prisma.InputJsonValue,
      objectKey: input.objectKey,
      etag: input.etag,
      publishedByPersonId: input.personId,
      publishedAt: input.now,
    },
  });
  await input.tx.contentDocument.update({
    where: { eventId: scope.eventId },
    data: { publishedVersionId: row.id },
  });
  return row;
}
export const insertContentSchedule = (
  scope: EventScope,
  input: { tx: PrismaTransactionClient; version: number; personId: string; runAt: Date; now: Date },
) =>
  input.tx.scheduledAction.create({
    data: {
      eventId: scope.eventId,
      type: 'content.publish',
      payload: { expectedVersion: input.version },
      createdByPersonId: input.personId,
      runAt: input.runAt,
      createdAt: input.now,
    },
  });
