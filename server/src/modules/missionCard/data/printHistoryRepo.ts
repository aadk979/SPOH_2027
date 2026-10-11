import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

const summarySelect = {
  id: true,
  format: true,
  count: true,
  rehearsal: true,
  createdAt: true,
} as const;

export function findPrintAnchor(scope: EventScope, id: string) {
  return prisma.cardPrintExport.findFirst({
    where: { eventId: scope.eventId, id },
    select: { id: true, createdAt: true },
  });
}

type HistoryPage = { limit: number; anchor: { id: string; createdAt: Date } | null };

/** Explicit keyset predicates keep the previously scoped anchor inside this dataset. */
export function findPrintHistory(scope: EventScope, { limit, anchor }: HistoryPage) {
  return prisma.cardPrintExport.findMany({
    where: {
      eventId: scope.eventId,
      ...(anchor
        ? {
            OR: [
              { createdAt: { lt: anchor.createdAt } },
              { createdAt: anchor.createdAt, id: { lt: anchor.id } },
            ],
          }
        : {}),
    },
    select: summarySelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
}
