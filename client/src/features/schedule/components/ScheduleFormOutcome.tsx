import type { ReactNode } from 'react';
import { Callout } from '@/shared/ui';

/** What happened to the last submit: an invalid time, the server's refusal, or the new schedule. */
export function ScheduleFormOutcome({
  invalid,
  error,
  done,
}: {
  invalid: string | null;
  error: Error | null;
  done: boolean;
}): ReactNode {
  if (invalid || error)
    return (
      <Callout tone="alert" role="alert">
        {invalid ?? error?.message}
      </Callout>
    );
  if (done)
    return (
      <Callout tone="ok" role="status">
        Scheduled. It appears under Scheduled work, where it can be cancelled until it runs.
      </Callout>
    );
  return null;
}
