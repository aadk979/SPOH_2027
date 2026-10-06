import type { CategoryActivityResponse, CategoryScheduleRecord } from '@spoh/shared';
import type { CategoryScheduleAction } from './categoryScheduleReview';
export interface CategoryScheduleReviewInput {
  action: CategoryScheduleAction;
  current: CategoryActivityResponse;
  latest?: CategoryScheduleRecord;
  timezone: string;
  accessAvailable: boolean;
  readUnavailable: boolean;
  onApplied: (current: CategoryActivityResponse) => void;
  refreshSchedules: () => Promise<void>;
}
