import { zonedWallTime } from '@spoh/shared';
import { captureScheduleInstant } from '../model/captureScheduleReview';

export function CaptureScheduleTimePreview({
  wallTime,
  timezone,
}: {
  wallTime: string;
  timezone: string;
}) {
  try {
    const instant = captureScheduleInstant(wallTime, timezone);
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
