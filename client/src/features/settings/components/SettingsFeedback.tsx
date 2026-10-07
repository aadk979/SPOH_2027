import type { ReactNode } from 'react';
import { Callout } from '@/shared/ui';

export function SettingsFeedback({ canEdit }: { canEdit: boolean }): ReactNode {
  return canEdit ? null : (
    <Callout tone="info">
      These are the values the event is currently running on. Changing them is Chief and Admin only.
    </Callout>
  );
}
