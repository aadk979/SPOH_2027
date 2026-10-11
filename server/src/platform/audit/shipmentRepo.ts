import type { PrismaTransactionClient } from '../db/client.js';

export interface ShipmentCursor {
  readonly lastCreatedAt: Date;
  readonly lastId: string;
}

/** The epoch cursor ships the whole trail the first time a log group is configured. */
const START: ShipmentCursor = { lastCreatedAt: new Date(0), lastId: '' };

export async function readShipmentCursor(
  tx: PrismaTransactionClient,
  logGroup: string,
): Promise<ShipmentCursor> {
  const row = await tx.auditShipment.findUnique({ where: { logGroup } });
  return row ?? START;
}

/** Committed rows after the cursor and no later than `until`, oldest first. */
export function readAuditBatch(
  tx: PrismaTransactionClient,
  input: { after: ShipmentCursor; until: Date; limit: number },
) {
  const { after, until, limit } = input;
  return tx.auditLog.findMany({
    where: {
      createdAt: { lte: until },
      OR: [
        { createdAt: { gt: after.lastCreatedAt } },
        { createdAt: after.lastCreatedAt, id: { gt: after.lastId } },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
  });
}

export type AuditRow = Awaited<ReturnType<typeof readAuditBatch>>[number];

export function advanceShipmentCursor(
  tx: PrismaTransactionClient,
  input: { logGroup: string; last: AuditRow; count: number },
) {
  const { logGroup, last, count } = input;
  const cursor = { lastCreatedAt: last.createdAt, lastId: last.id };
  return tx.auditShipment.upsert({
    where: { logGroup },
    create: { logGroup, ...cursor, shipped: count },
    update: { ...cursor, shipped: { increment: count } },
  });
}
