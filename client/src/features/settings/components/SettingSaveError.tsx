import type { ReactNode } from 'react';
import { ErrorState } from '@/shared/ui';

/** Why a product rule was not saved: someone changed it, or the event's state forbids it. */
export function SettingSaveError({ error }: { error: unknown }): ReactNode {
  return (
    <ErrorState error={error} />
  );
}
