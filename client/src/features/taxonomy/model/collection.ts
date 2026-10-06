import type { CategoryScheduleRecord } from '@spoh/shared';
import type { CategoryScheduleAction } from './categoryScheduleReview';

export function categoryPageRows<Row>(
  data: { pages: { data: Row[] }[] } | undefined,
  unavailable: boolean,
): Row[] {
  return unavailable ? [] : (data?.pages.flatMap((page) => page.data) ?? []);
}
export function categoryScheduleCreationAllowed(input: {
  disabled: boolean;
  success: boolean;
  error: boolean;
  more: boolean;
  filtered: boolean;
}) {
  return !input.disabled && input.success && !input.error && !input.more && !input.filtered;
}
export function categoryLatestSchedule(
  action: CategoryScheduleAction,
  rows: CategoryScheduleRecord[],
) {
  return action.kind === 'create' ? undefined : rows.find((row) => row.id === action.schedule.id);
}
export function categoryReadsUnavailable(...flags: boolean[]) {
  return flags.some(Boolean);
}
