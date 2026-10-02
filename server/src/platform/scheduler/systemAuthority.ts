import { ScheduleRefusal } from './failure.js';
import type { ScheduleContext } from './handler.js';
import type { EventScope } from '../db/eventScope.js';

/** Platform maintenance cannot be scheduled as a user or smuggled into one event's scope. */
export async function requirePlatformSystemAction(context: ScheduleContext): Promise<void> {
  if (context.action.createdByPersonId !== null || context.action.eventId !== null) {
    throw new ScheduleRefusal('SYSTEM_ONLY');
  }
}

/** Event maintenance names exactly one stored event and cannot run as a user's action. */
export function systemEventScope(context: ScheduleContext): EventScope {
  if (context.action.createdByPersonId !== null || context.action.eventId === null) {
    throw new ScheduleRefusal('SYSTEM_ONLY');
  }
  return { eventId: context.action.eventId };
}
