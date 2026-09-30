import type { ReactNode } from 'react';
import { Card, CardTitle, Stack } from '@/shared/ui';
import { SignOutButton } from '@/shared/shell/SignOutButton';

/** Signed in, but on no event's roster (or every membership has ended). */
export function NoEvents(): ReactNode {
  return (
    <main className="mx-auto w-full max-w-reading px-md py-lg">
      <Stack>
        <Card className="flex flex-col gap-md text-center">
          <CardTitle as="h1">You are not on an event roster</CardTitle>
          <p className="text-body text-text-muted">
            Ask the event&apos;s coordinator to add you, then sign in again.
          </p>
          <SignOutButton />
        </Card>
      </Stack>
    </main>
  );
}
