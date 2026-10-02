import { jsonNull, type JsonValue, type PrismaTransactionClient } from '../db/client.js';

export interface RecurringActionInput {
  type: string;
  eventId: string | null;
  payload: JsonValue | null;
  intervalSeconds: number;
  dedupeKey: string;
  now: Date;
}

/** Conflict is deliberately a no-op: restarts must not reset a failed/dead job or its lease. */
export async function upsertRecurringAction(
  tx: PrismaTransactionClient,
  input: RecurringActionInput,
) {
  if (input.eventId !== null) {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${input.eventId} FOR SHARE`;
  }
  const runAt = new Date(input.now.getTime() + input.intervalSeconds * 1000);
  await tx.scheduledAction.createMany({
    data: {
      eventId: input.eventId,
      type: input.type,
      payload: input.payload === null ? jsonNull : input.payload,
      recurrence: input.intervalSeconds,
      runAt,
      scheduledFor: runAt,
      dedupeKey: input.dedupeKey,
      createdAt: input.now,
    },
    skipDuplicates: true,
  });
  return tx.scheduledAction.findUniqueOrThrow({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true },
  });
}
