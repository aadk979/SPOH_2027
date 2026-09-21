'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { ButtonLink, Card, CardTitle, Stack } from '@/components/ui';

export default function NotFound(): ReactNode {
  return (
    <AppShell title="Page not found" back={{ href: '/home', label: 'Home' }} width="reading">
      <Stack>
        <Card className="flex flex-col gap-md text-center">
          <CardTitle as="h2">This page does not exist</CardTitle>
          <p className="text-body text-text-muted">
            The link may be outdated, or the address was mistyped. Your shift, the event guide, and
            safety tools are still available.
          </p>

          <div className="flex flex-wrap justify-center gap-sm">
            <ButtonLink href="/home" variant="primary">
              Back to Home
            </ButtonLink>
            <ButtonLink href="/guide" variant="secondary">
              Event Guide
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
