import { ScheduleTimelineResponse, type ScheduledActionStatus } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

export async function listScheduleTimeline(
  eventId: string,
  input: { status?: ScheduledActionStatus; cursor?: string },
) {
  const query = new URLSearchParams({ limit: '20' });
  if (input.status) query.set('status', input.status);
  if (input.cursor) query.set('cursor', input.cursor);
  const page = ScheduleTimelineResponse.parse(await eventApi(eventId, `/schedules?${query}`));
  if (page.eventId !== eventId) throw new Error('Schedule timeline event mismatch');
  return page;
}
