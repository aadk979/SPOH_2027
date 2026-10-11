import type {
  CreateCaptureCategoryRequest,
  CreateStationTagRequest,
  CreateStationTypeRequest,
  UpdateCaptureCategoryRequest,
  UpdateStationTagRequest,
  UpdateStationTypeRequest,
} from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export const TYPE_FIELDS = {
  id: true,
  code: true,
  label: true,
  active: true,
  sortOrder: true,
  registersVisitors: true,
  countsEntry: true,
  issuesStamp: true,
  redeemsGifts: true,
} as const;
export const TAG_FIELDS = {
  id: true,
  code: true,
  label: true,
  active: true,
  description: true,
} as const;
export const CATEGORY_FIELDS = {
  id: true,
  code: true,
  label: true,
  active: true,
  sortOrder: true,
  updatedAt: true,
} as const;

export async function lockStructureEvent(scope: EventScope, tx: PrismaTransactionClient) {
  const rows = await tx.$queryRaw<
    Array<{ status: string; timezone: string }>
  >`SELECT status, timezone FROM "Event" WHERE id = ${scope.eventId} FOR UPDATE`;
  return rows[0];
}
export function createType(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; body: CreateStationTypeRequest },
) {
  const { idempotencyKey: _key, ...data } = input.body;
  return input.tx.stationType.create({
    data: { ...data, eventId: scope.eventId },
    select: TYPE_FIELDS,
  });
}
export function findType(scope: EventScope, input: { tx: PrismaTransactionClient; id: string }) {
  return input.tx.stationType.findFirst({
    where: { eventId: scope.eventId, id: input.id },
    select: TYPE_FIELDS,
  });
}
export function updateType(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; body: UpdateStationTypeRequest },
) {
  const { idempotencyKey: _key, ...data } = input.body;
  return input.tx.stationType.update({
    where: { eventId: scope.eventId, id: input.id },
    data,
    select: TYPE_FIELDS,
  });
}
export function activeTypeStations(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string },
) {
  return input.tx.station.count({
    where: { eventId: scope.eventId, typeId: input.id, active: true },
  });
}
export function createTag(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; body: CreateStationTagRequest },
) {
  const { idempotencyKey: _key, ...data } = input.body;
  return input.tx.stationTag.create({
    data: { ...data, eventId: scope.eventId },
    select: TAG_FIELDS,
  });
}
export function findTag(scope: EventScope, input: { tx: PrismaTransactionClient; id: string }) {
  return input.tx.stationTag.findFirst({
    where: { eventId: scope.eventId, id: input.id },
    select: TAG_FIELDS,
  });
}
export function updateTag(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; body: UpdateStationTagRequest },
) {
  const { idempotencyKey: _key, ...data } = input.body;
  return input.tx.stationTag.update({
    where: { eventId: scope.eventId, id: input.id },
    data,
    select: TAG_FIELDS,
  });
}
export function createCategory(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; body: CreateCaptureCategoryRequest },
) {
  const { idempotencyKey: _key, ...data } = input.body;
  return input.tx.captureCategory.create({
    data: { ...data, eventId: scope.eventId },
    select: CATEGORY_FIELDS,
  });
}
export function findCategory(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string },
) {
  return input.tx.captureCategory.findFirst({
    where: { eventId: scope.eventId, id: input.id },
    select: CATEGORY_FIELDS,
  });
}
export function updateCategory(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; body: UpdateCaptureCategoryRequest },
) {
  const { idempotencyKey: _key, ...data } = input.body;
  return input.tx.captureCategory.update({
    where: { eventId: scope.eventId, id: input.id },
    data,
    select: CATEGORY_FIELDS,
  });
}
