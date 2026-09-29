import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { findShiftPlan, insertShifts } from '../data/repo.js';
import { shiftWindow } from '../domain/shiftWindow.js';

/**
 * A shift per active template on a day of the event, at the template's hours in
 * the event's timezone. Idempotent: a template the day already has is skipped.
 */
export async function addShiftsForDay(
  tx: PrismaTransactionClient,
  scope: EventScope,
  day: { id: string; date: string },
): Promise<void> {
  const plan = await findShiftPlan(tx, scope);
  await insertShifts(
    tx,
    scope,
    plan.templates.map((template) => ({
      eventDayId: day.id,
      templateId: template.id,
      ...shiftWindow(day.date, template, plan.timezone),
    })),
  );
}
