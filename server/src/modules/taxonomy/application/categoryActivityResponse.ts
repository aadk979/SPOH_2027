import { CategoryActivityResponse, type EventStatus } from '@spoh/shared';
import type { CategoryActivityRow } from '../data/categoryReadRepo.js';
import { toCategoryActivity } from '../data/categoryScheduleMapper.js';

export function categoryActivityResponse(input: {
  eventId: string;
  eventStatus: EventStatus;
  category: CategoryActivityRow;
  now: Date;
}) {
  return CategoryActivityResponse.parse({
    eventId: input.eventId,
    eventStatus: input.eventStatus,
    evaluatedAt: input.now.toISOString(),
    data: toCategoryActivity(input.category),
  });
}
