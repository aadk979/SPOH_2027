import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { eventTimezone } from '../../../platform/event/currentEvent.js';
import { listFollowingShifts, setShiftWindow, updateTemplateHours } from '../data/repo.js';
import { shiftWindow } from '../domain/shiftWindow.js';

/**
 * Expand phase (P09.5): the settings screen still edits the shift hours as
 * `shiftBlocks`. A change moves the event's templates of those codes, and every
 * shift that still follows its template, so the hours on the screen and the
 * hours capture and check-in obey stay one and the same.
 */
export async function applyShiftHours(
  scope: EventScope,
  hours: Readonly<Record<string, { start: string; end: string }>>,
): Promise<void> {
  const timezone = await eventTimezone(scope);
  await prisma.$transaction(async (tx) => {
    for (const [code, { start, end }] of Object.entries(hours)) {
      const template = await updateTemplateHours(tx, scope, {
        code,
        startLocal: start,
        endLocal: end,
      });
      if (!template) continue;
      for (const shift of await listFollowingShifts(tx, scope, template.id)) {
        const date = shift.eventDay.date.toISOString().slice(0, 10);
        await setShiftWindow(tx, scope, { id: shift.id, ...shiftWindow(date, template, timezone) });
      }
    }
  });
}
