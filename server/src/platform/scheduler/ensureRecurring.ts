import { prisma, type JsonValue } from '../db/client.js';
import { systemClock, type Clock } from '../time/index.js';
import type { HandlerRegistry } from './registry.js';
import { upsertRecurringAction } from './recurringRepo.js';

/** Boot composition owns system-only recurring seeds; no user scheduling API is exposed here. */
export async function ensureRecurring(input: {
  registry: HandlerRegistry;
  type: string;
  intervalSeconds: number;
  eventId?: string;
  payload?: JsonValue | null;
  clock?: Clock;
}) {
  const handler = input.registry.get(input.type);
  if (!handler) throw new Error('Recurring handler is not registered');
  if (
    !Number.isInteger(input.intervalSeconds) ||
    input.intervalSeconds < 1 ||
    input.intervalSeconds > 2_147_483_647
  ) {
    throw new Error('Invalid recurrence interval');
  }
  const eventId = input.eventId ?? null;
  const payload = input.payload === undefined ? {} : input.payload;
  handler.validatePayload(payload);
  // JSON tuple encoding cannot collide through delimiter-containing scope IDs or types.
  const dedupeKey = `recurring:${JSON.stringify([eventId, input.type])}`;
  return prisma.$transaction((tx) =>
    upsertRecurringAction(tx, {
      type: input.type,
      intervalSeconds: input.intervalSeconds,
      eventId,
      dedupeKey,
      payload,
      now: (input.clock ?? systemClock).now(),
    }),
  );
}
