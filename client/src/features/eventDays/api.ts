import { EventDayRecord, collection } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

const EventDayList = collection(EventDayRecord);

export async function listEventDays(
  eventId: string,
  signal?: AbortSignal,
): Promise<EventDayRecord[]> {
  return EventDayList.parse(
    await eventApi(eventId, '/admin/event-days', {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    }),
  ).data;
}
