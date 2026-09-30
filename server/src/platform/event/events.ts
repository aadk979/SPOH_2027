import { prisma } from '../db/client.js';
import type { EventScope } from '../db/eventScope.js';
import { ServiceUnavailableError } from '../errors/index.js';
import type { EventZone } from '../time/index.js';

/**
 * The event the pre-P09.7 paths (`/api/v1/registrations` …) still work in:
 * Event #1, the first event created that is not archived. Those paths are
 * aliases of its event-scoped paths (ADR-001 §4, ADR-009 §6), kept for queued
 * outbox entries and old clients until P16.7 removes them. It stays Event #1
 * after it closes, because the outbox drains after the event.
 *
 * Read on every alias request and changed only when an event is created or
 * archived, so it is cached for a minute like the roster lookup beside it.
 */
const TTL_MS = 60_000;
let cached: { event: EventScope; expiresAt: number } | null = null;

export async function aliasEvent(): Promise<EventScope> {
  if (cached && cached.expiresAt > Date.now()) return cached.event;
  const row = await prisma.event.findFirst({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!row) throw new ServiceUnavailableError('No event is set up yet');
  const event = { eventId: row.id };
  cached = { event, expiresAt: Date.now() + TTL_MS };
  return event;
}

/** Forget cached events and zones: after one is created, edited or archived, and between tests. */
export function invalidateEventCache(): void {
  cached = null;
  zones.clear();
}

const zones = new Map<string, EventZone & { slug: string }>();

/**
 * An event's wall clock: its IANA timezone and day boundary. Neither changes
 * once the event runs, so it is cached for the process; `invalidateEventCache`
 * forgets it for set-up edits and tests.
 */
export async function eventZone(scope: EventScope): Promise<EventZone> {
  const { timezone, dayBoundaryMinutes } = await eventRow(scope);
  return { timezone, dayBoundaryMinutes };
}

/** An event's slug: the client's addresses are `/e/<slug>/…` (ADR-001 §5). */
export async function eventSlug(scope: EventScope): Promise<string> {
  return (await eventRow(scope)).slug;
}

async function eventRow(scope: EventScope): Promise<EventZone & { slug: string }> {
  const known = zones.get(scope.eventId);
  if (known) return known;
  const row = await prisma.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { timezone: true, dayBoundaryMinutes: true, slug: true },
  });
  zones.set(scope.eventId, row);
  return row;
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
