import { prisma } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { ServiceUnavailableError } from '../errors/index.js';
import type { EventZone } from '../time/index.js';

/**
 * The event a request works in, until P09.7 puts it in the URL: the newest
 * event that is neither closed nor archived. With one event, that is Event #1.
 *
 * Read on every authenticated request, changed only when an event is created
 * or closed, so it is cached for a minute like the roster lookup beside it.
 */
export interface CurrentEvent extends EventScope {
  timezone: string;
}

const TTL_MS = 60_000;
let cached: { event: CurrentEvent; expiresAt: number } | null = null;

export async function currentEvent(): Promise<CurrentEvent> {
  if (cached && cached.expiresAt > Date.now()) return cached.event;
  const row = await prisma.event.findFirst({
    where: { status: { notIn: ['CLOSED', 'ARCHIVED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, timezone: true },
  });
  if (!row) throw new ServiceUnavailableError('No event is set up yet');
  const event = { eventId: row.id, timezone: row.timezone };
  cached = { event, expiresAt: Date.now() + TTL_MS };
  return event;
}

/** Forget the cached event and zones: after one is created, edited or closed, and between tests. */
export function invalidateCurrentEvent(): void {
  cached = null;
  zones.clear();
}

const zones = new Map<string, EventZone>();

/**
 * An event's wall clock: its IANA timezone and day boundary. Neither changes
 * once the event runs, so it is cached for the process; `invalidateCurrentEvent`
 * forgets it for set-up edits and tests.
 */
export async function eventZone(scope: EventScope): Promise<EventZone> {
  const known = zones.get(scope.eventId);
  if (known) return known;
  const zone = await prisma.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { timezone: true, dayBoundaryMinutes: true },
  });
  zones.set(scope.eventId, zone);
  return zone;
}

/** An event's IANA timezone. */
export async function eventTimezone(scope: EventScope): Promise<string> {
  return (await eventZone(scope)).timezone;
}

/**
 * Every event's scope, for system jobs that have no request behind them and
 * work event by event (a purge, a sweep).
 */
export async function allEventScopes(): Promise<EventScope[]> {
  const events = await prisma.event.findMany({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return events.map((event) => ({ eventId: event.id }));
}
