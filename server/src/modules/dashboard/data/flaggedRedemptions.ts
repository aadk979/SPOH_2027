import type { FlaggedRedemption } from '@spoh/shared';
import { prisma } from '../../../platform/db/client.js';

/**
 * Queued redemptions that broke a rule on sync, over a range, optionally at one
 * station: what the IC follows up (ADR-007 §5, F03-034). Voided ones are done.
 */
export async function flaggedRedemptions(input: {
  since: Date;
  until: Date;
  stationId?: string;
}): Promise<FlaggedRedemption[]> {
  const rows = await prisma.giftRedemption.findMany({
    where: {
      flag: { not: null },
      voided: false,
      recordedAt: { gte: input.since, lte: input.until },
      ...(input.stationId ? { stationId: input.stationId } : {}),
    },
    select: {
      id: true,
      flag: true,
      recordedAt: true,
      stationId: true,
      giftType: { select: { name: true } },
      station: { select: { name: true } },
      recordedBy: { select: { displayName: true } },
    },
    orderBy: { recordedAt: 'desc' },
  });
  return rows.flatMap((row) =>
    row.flag
      ? [
          {
            redemptionId: row.id,
            giftTypeName: row.giftType.name,
            stationId: row.stationId,
            stationName: row.station.name,
            recordedByName: row.recordedBy.displayName,
            flag: row.flag,
            recordedAt: row.recordedAt.toISOString(),
          },
        ]
      : [],
  );
}
