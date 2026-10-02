import { ScheduleRefusal } from './failure.js';
import type { ScheduleContext } from './handler.js';

/** Platform maintenance cannot be scheduled as a user or smuggled into one event's scope. */
export async function requirePlatformSystemAction(context: ScheduleContext): Promise<void> {
  if (context.action.createdByPersonId !== null || context.action.eventId !== null) {
    throw new ScheduleRefusal('SYSTEM_ONLY');
  }
}
