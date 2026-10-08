import { defaultRoleGrantRows } from '../../../platform/access/authorizer/roleGrants.js';
import { prisma } from '../../../platform/db/client.js';
import { invalidateEventCache } from '../../../platform/event/events.js';
import {
  insertEvent,
  insertRoleGrants,
  insertTaxonomy,
  type Event,
  type EventStatus,
  type EventTaxonomy,
} from '../data/repo.js';

export interface NewEvent extends EventTaxonomy {
  organisationId: string;
  slug: string;
  name: string;
  venue?: string | null;
  /** IANA timezone; every wall-clock time of the event is read in it. */
  timezone: string;
  locale?: string;
  status?: EventStatus;
  dayBoundaryMinutes?: number;
}

/**
 * Create an event with its taxonomy: capture categories, station types and
 * shift templates (ADR-001, ADR-002), and the approved default role grants
 * (ADR-005 §2). The one way events come into being, for
 * production (P09.9 cloning, P10 set-up) and for fixtures alike.
 */
export async function createEvent(input: NewEvent): Promise<Event> {
  const { categories, stationTypes, shiftTemplates, ...event } = input;
  const created = await prisma.$transaction(async (tx) => {
    const row = await insertEvent(tx, event);
    await insertTaxonomy(tx, { eventId: row.id }, { categories, stationTypes, shiftTemplates });
    await insertRoleGrants(tx, { eventId: row.id }, defaultRoleGrantRows());
    return row;
  });
  invalidateEventCache();
  return created;
}
