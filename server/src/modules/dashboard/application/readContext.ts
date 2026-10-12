import { createReadContext, type ReadContext } from '../../../platform/access/currentRead.js';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { systemClock } from '../../../platform/time/index.js';

/** Bind one dashboard request's authority and observation time in the use-case layer. */
export function dashboardReader(input: {
  scope: EventScope;
  personId: string;
  membershipId: string;
  ip: string | null;
}): ReadContext {
  return createReadContext({ ...input, now: systemClock.now(), db: prisma });
}
