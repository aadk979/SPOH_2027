'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui';
import { VISITOR_JOURNEY } from '@/content/brief';
import { useRequireSession } from '@/features/session/useSession';

/**
 * The visitor journey (slide 5), as a diagram rather than a paragraph.
 *
 * This is the single screen that fixes "volunteers did not know what the event
 * was, just that they were a volunteer". A volunteer who can see where their
 * station sits in the six steps can answer a visitor without escalating.
 */
export default function JourneyPage(): ReactNode {
  const session = useRequireSession();
  if (!session) return null;

  return (
    <AppShell title="The visitor journey" back={{ href: '/home', label: 'Home' }}>
      <ol className="flex flex-col gap-sm">
        {VISITOR_JOURNEY.map((step) => (
          <Card as="li" key={step.step} className="flex gap-md">
            {/*
              The step number is a graphic, not content: the list itself is
              ordered, so a screen reader already announces "item 3 of 6" and
              reading "3" again is noise.
            */}
            <span
              aria-hidden="true"
              className="flex size-[36px] shrink-0 items-center justify-center rounded-pill bg-primary font-display text-body font-semibold text-on-primary tabular-nums"
            >
              {step.step}
            </span>

            <span className="min-w-0">
              <span className="block text-tagline font-semibold">{step.title}</span>
              <span className="block text-reading text-text-muted">{step.detail}</span>
            </span>
          </Card>
        ))}
      </ol>

      <Card variant="flat" className="mt-lg">
        One Mission Card can be a whole family. That is why the registration count and the card
        count are different numbers, and why nobody should add them together.
      </Card>
    </AppShell>
  );
}
