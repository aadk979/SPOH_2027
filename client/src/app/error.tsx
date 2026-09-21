'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, ButtonLink, Callout, Card, CardTitle, Stack } from '@/components/ui';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset(): void;
}): ReactNode {

  return (
    <AppShell title="Something went wrong" back={{ href: '/home', label: 'Home' }} width="reading">
      <Stack>
        <Callout tone="alert" role="alert" title="An unexpected error occurred">
          {error.message || 'The application encountered an unexpected issue.'}
        </Callout>

        <Card className="flex flex-col gap-md">
          <CardTitle as="h2">What you can do</CardTitle>
          <p className="text-body text-text-muted">
            Try refreshing the screen. If you are in the middle of a critical operation, tell your
            IC or reach out via the radio. Offline counts and sync queues are preserved.
          </p>

          <div className="flex flex-wrap gap-sm">
            <Button variant="primary" onClick={() => reset()}>
              Try again
            </Button>
            <ButtonLink href="/home" variant="secondary">
              Back to Home
            </ButtonLink>
            <ButtonLink href="/safety" variant="quiet">
              Safety & Help
            </ButtonLink>
          </div>
        </Card>
      </Stack>
    </AppShell>
  );
}
