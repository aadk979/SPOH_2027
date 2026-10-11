import type { CreateManagedTemplateRequest, UpdateManagedTemplateRequest } from '@spoh/shared';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

export const TEMPLATE_FIELDS = {
  id: true,
  code: true,
  label: true,
  active: true,
  sortOrder: true,
  startLocal: true,
  endLocal: true,
  endsNextDay: true,
} as const;
export const SHIFT_FIELDS = {
  id: true,
  eventDayId: true,
  templateId: true,
  startsAt: true,
  endsAt: true,
  overridden: true,
  eventDay: { select: { date: true, label: true } },
  template: { select: TEMPLATE_FIELDS },
} as const;

export function createTemplate(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; body: CreateManagedTemplateRequest },
) {
  const { idempotencyKey: _key, ...data } = input.body;
  return input.tx.shiftTemplate.create({
    data: { ...data, eventId: scope.eventId },
    select: TEMPLATE_FIELDS,
  });
}
export function findTemplate(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string },
) {
  return input.tx.shiftTemplate.findFirst({
    where: { eventId: scope.eventId, id: input.id },
    select: TEMPLATE_FIELDS,
  });
}
export function updateTemplate(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string; body: UpdateManagedTemplateRequest },
) {
  const { idempotencyKey: _key, ...data } = input.body;
  return input.tx.shiftTemplate.update({
    where: { eventId: scope.eventId, id: input.id },
    data,
    select: TEMPLATE_FIELDS,
  });
}
export function listDays(scope: EventScope, tx: PrismaTransactionClient) {
  return tx.eventDay.findMany({
    where: { eventId: scope.eventId },
    select: { id: true, date: true },
  });
}
export function listTemplateShifts(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string },
) {
  return input.tx.shift.findMany({
    where: { eventId: scope.eventId, templateId: input.id },
    select: { ...SHIFT_FIELDS, _count: { select: { assignments: true } } },
  });
}
export function insertTemplateShifts(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    rows: Array<{ eventDayId: string; templateId: string; startsAt: Date; endsAt: Date }>;
  },
) {
  return input.tx.shift.createMany({
    data: input.rows.map((row) => ({ ...row, eventId: scope.eventId })),
    skipDuplicates: true,
  });
}
export function removeTemplateShifts(
  scope: EventScope,
  input: { tx: PrismaTransactionClient; id: string },
) {
  return input.tx.shift.deleteMany({ where: { eventId: scope.eventId, templateId: input.id } });
}
export function findShift(scope: EventScope, input: { tx: PrismaTransactionClient; id: string }) {
  return input.tx.shift.findFirst({
    where: { eventId: scope.eventId, id: input.id },
    select: SHIFT_FIELDS,
  });
}
export function setShiftWindow(
  scope: EventScope,
  input: {
    tx: PrismaTransactionClient;
    id: string;
    startsAt: Date;
    endsAt: Date;
    overridden: boolean;
  },
) {
  return input.tx.shift.update({
    where: { eventId: scope.eventId, id: input.id },
    data: { startsAt: input.startsAt, endsAt: input.endsAt, overridden: input.overridden },
    select: SHIFT_FIELDS,
  });
}
