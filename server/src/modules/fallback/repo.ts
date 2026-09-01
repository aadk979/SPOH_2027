import { prisma } from '../../lib/prisma.js';

/**
 * Fallback-window awareness (PRODUCT_BRIEF §11.4).
 *
 * Declaring, closing and importing from fallback windows is Phase 4 work. What
 * exists now is the read every summary endpoint needs: does this time range
 * overlap a period of degraded operation? A report that quietly mixes app data
 * and paper estimates without saying so is worse than one that says "this hour
 * is approximate", so the flag ships with the counts from the start rather than
 * being retrofitted once the importers exist.
 */
export async function rangeOverlapsFallbackWindow(range: {
  from?: Date;
  to?: Date;
  stationId?: string;
}): Promise<boolean> {
  const from = range.from ?? new Date(0);
  const to = range.to ?? new Date(8.64e15);

  const overlapping = await prisma.fallbackWindow.findFirst({
    where: {
      startedAt: { lt: to },
      AND: [
        // An open window (endedAt null) extends to now, so it overlaps anything
        // that starts before the present.
        { OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
        // A window declared for one station does not taint another station's
        // data; an event-wide window (stationId null) taints everything.
        ...(range.stationId ? [{ OR: [{ stationId: null }, { stationId: range.stationId }] }] : []),
      ],
    },
    select: { id: true },
  });

  return overlapping !== null;
}
