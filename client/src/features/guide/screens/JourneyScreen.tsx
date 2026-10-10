'use client';
import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { Card } from '@/shared/ui';
import { useRequireSession } from '@/features/session';
import { PublishedGuideState } from '@/features/content';
export default function JourneyScreen(): ReactNode {
  const session = useRequireSession();
  if (!session) return null;
  return (
    <AppShell title="The visitor journey" back={{ href: '/home', label: 'Home' }}>
      <PublishedGuideState>
        {(record) => (
          <>
            <ol className="flex flex-col gap-sm">
              {record.body.journey.steps.map((step, index) => (
                <Card as="li" key={index} className="flex gap-md">
                  <span
                    aria-hidden="true"
                    className="flex size-[36px] shrink-0 items-center justify-center rounded-pill bg-primary font-display text-body font-semibold text-on-primary tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-tagline font-semibold">{step.title}</span>
                    <span className="block text-reading text-text-muted">{step.detail}</span>
                  </span>
                </Card>
              ))}
            </ol>
            {record.body.journey.note ? (
              <Card variant="flat" className="mt-lg">
                {record.body.journey.note}
              </Card>
            ) : null}
          </>
        )}
      </PublishedGuideState>
    </AppShell>
  );
}
