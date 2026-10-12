import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const reference = { id: true, code: true, name: true, floor: true, active: true } as const;

export function stationReference(scope: EventScope, db: PrismaTransactionClient, id: string) {
  return db.station.findFirst({ where: { eventId: scope.eventId, id }, select: reference });
}

export function searchStationReferences(scope: EventScope, db: PrismaTransactionClient,
  input: { query: string; limit: number }) {
  return db.station.findMany({ where: { eventId: scope.eventId, OR: [
    { name: { contains: input.query, mode: 'insensitive' } },
    { code: { contains: input.query, mode: 'insensitive' } },
  ] }, select: reference, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: input.limit });
}
