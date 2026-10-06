import { Callout } from '@/shared/ui';

export function CategoryScheduleAccessNotice() {
  return (
    <Callout role="alert" tone="alert">
      Current event access and clock are unavailable. Reload your session before category
      scheduling.
    </Callout>
  );
}
