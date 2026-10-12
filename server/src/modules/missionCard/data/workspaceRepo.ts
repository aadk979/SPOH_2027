import type { Prisma } from '../../../generated/prisma/client.js';
import type { ReadDatabase } from '../../../platform/db/readDatabase.js';
import { afterTime } from '../../../platform/db/workspacePagination.js';

const cardSelect = { id: true, shortCode: true, status: true, rehearsal: true, issuedAt: true,
  completedAt: true, createdAt: true, voidedAt: true, reissuedFromId: true } as const;
const stampSelect = { id: true, stationId: true, missionCardId: true, recordedById: true,
  recordedAt: true, source: true, rehearsal: true } as const;
export function workspaceCard(context: ReadDatabase, id: string) {
  return context.db.missionCard.findFirst({ where: { eventId: context.scope.eventId, id }, select: cardSelect });
}
/** Same minimal scan authority as an individual card; no recorder or visitor data. */
export async function workspaceCardJourney(context: ReadDatabase, input: { id: string; rehearsal: boolean; asOf: Date }) {
  const where = { eventId: context.scope.eventId, active: true, type: { eventId: context.scope.eventId, issuesStamp: true },
    stampEvents: { none: { eventId: context.scope.eventId, missionCardId: input.id,
      rehearsal: input.rehearsal, recordedAt: { lte: input.asOf } } } };
  const left = await (context.db.station.findMany({ where, select: { id: true, name: true }, orderBy: { id: 'asc' }, take: 50 }));
  const leftCount = await (context.db.station.count({ where }));
  const redeemed = await (context.db.giftRedemption.count({ where: { eventId: context.scope.eventId, missionCardId: input.id,
      rehearsal: input.rehearsal, voided: false, recordedAt: { lte: input.asOf } } }));
  return { redeemed: redeemed > 0, left, leftCount };
}
export function workspaceReplacements(context: ReadDatabase, id: string) {
  return context.db.missionCard.findMany({ where: { eventId: context.scope.eventId, reissuedFromId: id },
    select: { id: true, shortCode: true }, orderBy: { id: 'asc' }, take: 30 });
}
export async function workspaceCards(context: ReadDatabase, input: {
  where: Prisma.MissionCardWhereInput; limit: number; cursor?: string;
}) {
  const anchor = input.cursor ? await context.db.missionCard.findFirst({ where: { ...input.where, id: input.cursor },
    select: { id: true, createdAt: true } }) : null;
  const count = await (context.db.missionCard.count({ where: input.where }));
  const rows = await (context.db.missionCard.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.createdAt } : null, 'createdAt')] }, select: cardSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count, rows, cursorValid: !input.cursor || !!anchor };
}
export async function workspaceStamps(context: ReadDatabase, input: {
  where: Prisma.CardStampEventWhereInput; limit: number; cursor?: string;
}) {
  const anchor = input.cursor ? await context.db.cardStampEvent.findFirst({ where: { ...input.where, id: input.cursor },
    select: { id: true, recordedAt: true } }) : null;
  const count = await (context.db.cardStampEvent.count({ where: input.where }));
  const rows = await (context.db.cardStampEvent.findMany({ where: { AND: [input.where,
      afterTime(anchor ? { id: anchor.id, at: anchor.recordedAt } : null, 'recordedAt')] }, select: stampSelect,
    orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], take: input.limit + 1 }));
  return { count, rows, cursorValid: !input.cursor || !!anchor };
}
export function workspaceCardSearch(context: ReadDatabase, input: { query: string; limit: number }) {
  return context.db.missionCard.findMany({ where: { eventId: context.scope.eventId,
    shortCode: { contains: input.query, mode: 'insensitive' } }, select: cardSelect,
  orderBy: [{ shortCode: 'asc' }, { id: 'asc' }], take: input.limit + 1 });
}
export function workspaceCardStation(context: ReadDatabase, input: { id?: string; code?: string }) {
  return context.db.station.findFirst({ where: { eventId: context.scope.eventId,
    ...(input.id ? { id: input.id } : {}), ...(input.code ? { code: input.code } : {}) }, select: { id: true } });
}
