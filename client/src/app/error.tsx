'use client';

import type { ReactNode } from 'react';
import { Button, ButtonLink, Callout, Stack } from '@/shared/ui';

/** Errors outside an event's screens (sign-in, the picker); event screens have their own. */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset(): void;
}): ReactNode {
  return (
    <main className="mx-auto w-full max-w-reading px-md py-lg">
      <Stack>
        <Callout tone="alert" role="alert" title="An unexpected error occurred">
          {error.message || 'The application encountered an unexpected issue.'}
        </Callout>
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Start again
        </ButtonLink>
      </Stack>
    </main>
  );
}
