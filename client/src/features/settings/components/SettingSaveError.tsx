import type { ReactNode } from 'react';
import { ApiError } from '@/shared/lib/apiErrors';
import { Callout } from '@/shared/ui';

/** Why a product rule was not saved: someone changed it, or the event's state forbids it. */
export function SettingSaveError({ error }: { error: unknown }): ReactNode {
  return (
    <Callout tone="alert" role="alert" title="Not saved">
      {error instanceof ApiError ? error.message : 'Try again in a moment.'}
    </Callout>
  );
}
