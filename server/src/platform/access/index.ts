import { prisma } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { runningShifts } from '../event/runningShifts.js';

/**
 * Authorization, in two layers (BUILD_PLAN §6.3).
 *
 * Layer 1 — capability. Which actions this role may perform at all, read from
 * the shared capability matrix. Note this is NOT role precedence: `Lead`
 * outranks `Volunteer` but must not be able to create a registration, so a
 * precedence comparison would grant exactly the wrong thing.
 *
 * Layer 2 — station scope. For capture writes, whether the caller is actually
 * rostered on the target station for a shift that is running now. IC and above
 * bypass this, and the bypass is audited.
 */

/**
 * Is this membership rostered at this station on a shift running now
 * (`runningShifts`)? Checked against the database rather than the token
 * because assignments change hourly.
 */
export async function isOnShiftAt(
  scope: EventScope,
  who: { membershipId: string; stationId: string },
  now: Date = new Date(),
): Promise<boolean> {
  const assignment = await prisma.shiftAssignment.findFirst({
    where: { eventId: scope.eventId, ...who, shift: await runningShifts(scope, now) },
    select: { id: true },
  });
  return assignment !== null;
}
