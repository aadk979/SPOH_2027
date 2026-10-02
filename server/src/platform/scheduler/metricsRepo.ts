import { prisma } from '../db/client.js';

export interface SchedulerMetrics {
  schedulerLagSeconds: number;
  schedulerDeadActions: number;
}

/** Original deadlines measure lag; backed-off work is counted only when eligible again. */
export async function readSchedulerMetrics(input: {
  now: Date;
  types: readonly string[];
}): Promise<SchedulerMetrics> {
  const rows = await prisma.$queryRaw<SchedulerMetrics[]>`
    WITH registered AS (
      SELECT * FROM "ScheduledAction"
       WHERE type IN (SELECT jsonb_array_elements_text(${JSON.stringify(input.types)}::jsonb))
    )
    SELECT GREATEST(COALESCE(MAX(EXTRACT(EPOCH FROM (${input.now}::timestamptz - COALESCE("scheduledFor", "runAt")))) FILTER (
      WHERE (status = 'PENDING' AND "runAt" <= ${input.now})
         OR (status = 'RUNNING' AND "lockedUntil" < ${input.now})
    ), 0), 0)::float8 AS "schedulerLagSeconds",
    COUNT(*) FILTER (WHERE status = 'DEAD')::int AS "schedulerDeadActions"
    FROM registered
  `;
  return rows[0]!;
}
