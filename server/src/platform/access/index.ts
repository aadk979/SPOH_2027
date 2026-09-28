import { prisma } from '../db/client.js';
import { activeShiftBlocks, eventDayAnchor, singaporeDateString } from '../time/index.js';

/**
 * Authorization, in two layers (BUILD_PLAN §6.3).
 *
 * Layer 1 — capability. Which actions this role may perform at all, read from
 * the shared capability matrix. Note this is NOT role precedence: `Lead`
 * outranks `Volunteer` but must not be able to create a registration, so a
 * precedence comparison would grant exactly the wrong thing.
 *
 * Layer 2 — station scope. For capture writes, whether the caller is actually
 * rostered on the target station for a currently-running shift block. IC and
 * above bypass this, and the bypass is audited.
 */

/**
 * Is this volunteer rostered at this station, today, in a block that is
 * currently running? Checked against the database rather than the token because
 * station assignment changes hourly and group membership does not.
 */
export async function isRosteredAt(volunteerId: string, stationId: string): Promise<boolean> {
  const blocks = activeShiftBlocks();
  if (blocks.length === 0) return false;

  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      volunteerId,
      stationId,
      block: { in: blocks },
      eventDay: { date: eventDayAnchor(singaporeDateString()) },
    },
    select: { id: true },
  });

  return assignment !== null;
}
