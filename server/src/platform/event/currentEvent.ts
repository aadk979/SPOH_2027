import { prisma } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { ServiceUnavailableError } from '../errors/index.js';

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

/** Forget the cached event: after one is created or closed, and between tests. */
export function invalidateCurrentEvent(): void {
  cached = null;
}

const timezones = new Map<string, string>();

/** An event's IANA timezone. Fixed once the event exists, so cached for the process. */
export async function eventTimezone(scope: EventScope): Promise<string> {
  const known = timezones.get(scope.eventId);
  if (known) return known;
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { timezone: true },
  });
  timezones.set(scope.eventId, event.timezone);
  return event.timezone;
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
