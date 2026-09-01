'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
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
      <ol className="flex flex-col gap-3">
        {VISITOR_JOURNEY.map((step) => (
          <li key={step.step} className="tile flex gap-4">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-semibold"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
            >
              {step.step}
            </span>
            <span>
              <span className="block text-lg font-semibold">{step.title}</span>
              <span className="block" style={{ color: 'var(--text-muted)' }}>
                {step.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <p className="tile-flat mt-6">
        One Mission Card can be a whole family. That is why the registration count and the card
        count are different numbers, and why nobody should add them together.
      </p>
    </AppShell>
  );
}
