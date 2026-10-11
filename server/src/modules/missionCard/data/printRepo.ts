import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import type { CardPrintContext } from '../domain/printContext.js';
import { Prisma } from '../../../generated/prisma/client.js';

/** Lock in code order before reading status; every card writer can share this order. */
export async function lockPrintableCards(
  scope: EventScope,
  codes: string[],
  tx: PrismaTransactionClient,
) {
  const ordered = [...new Set(codes)].sort();
  if (ordered.length === 0) return;
  await tx.$queryRaw`SELECT id FROM "MissionCard" WHERE "eventId" = ${scope.eventId}
    AND "shortCode" IN (${Prisma.join(ordered)}) ORDER BY "shortCode" FOR UPDATE`;
}

export function printEventName(scope: EventScope, tx: PrismaTransactionClient) {
  return tx.event.findUniqueOrThrow({ where: { id: scope.eventId }, select: { name: true } });
}

export function printableCards(scope: EventScope, codes: string[], tx: PrismaTransactionClient) {
  return tx.missionCard.findMany({
    where: { eventId: scope.eventId, shortCode: { in: codes } },
    select: { shortCode: true, qrPayload: true, batchLabel: true, rehearsal: true, status: true },
    orderBy: { shortCode: 'asc' },
  });
}
export function savePrintExport(
  scope: EventScope,
  tx: PrismaTransactionClient,
  data: {
    id: string;
    objectKey: string;
    format: string;
    count: number;
    rehearsal: boolean;
    createdAt: Date;
    shortCodes: string[];
    printContext: CardPrintContext;
  },
) {
  return tx.cardPrintExport.create({ data: { ...data, eventId: scope.eventId } });
}
export function findPrintExport(scope: EventScope, id: string) {
  return prisma.cardPrintExport.findFirst({ where: { eventId: scope.eventId, id } });
}
