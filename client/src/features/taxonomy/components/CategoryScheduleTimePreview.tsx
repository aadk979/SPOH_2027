import { zonedWallTime } from '@spoh/shared';
import { categoryScheduleInstant } from '../model/categoryScheduleReview';

export function CategoryScheduleTimePreview({
  wallTime,
  timezone,
}: {
  wallTime: string;
  timezone: string;
}) {
  try {
    const instant = categoryScheduleInstant(wallTime, timezone);
    return (
      <p className="text-caption">
        Reviewed execution: {zonedWallTime(new Date(instant), timezone).replace('T', ' ')} (
        {timezone})
      </p>
    );
  } catch {
    return <p className="text-caption">Choose a valid execution time on the event clock.</p>;
  }
}
