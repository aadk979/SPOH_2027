'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, CardTitle, StatusText } from '@/components/ui';
import { FLOOR_MAP } from '@/content/brief';
import { useRequireSession } from '@/features/session/useSession';

/**
 * The floor map (PRODUCT_BRIEF §1.1).
 *
 * Text-first by design, not as a placeholder for a picture. A volunteer looking
 * for the nearest AED is looking for a fact, and a list of facts loads on a
 * congested network, works at any zoom, and reads aloud to a screen reader. The
 * T19 floor plan images sit alongside this once the committee supplies them,
 * and the service worker precaches both so this screen works with no network.
 *
 * Levels sit in a two-column grid on a laptop. Stacked, an IC scanning for the
 * AED on level 3 had to scroll past two full levels to reach it.
 */
export default function MapPage(): ReactNode {
  const session = useRequireSession();
  if (!session) return null;

  return (
    <AppShell width="wide" title="Floor map" back={{ href: '/home', label: 'Home' }}>
      <p className="mb-md text-text-muted">
        T19, School of Computing. Safety points are listed on every level.
      </p>

      <div className="grid gap-sm sm:gap-md lg:grid-cols-2">
        {FLOOR_MAP.map((floor) => (
          <Card as="section" key={floor.level}>
            <CardTitle>{floor.level}</CardTitle>

            <ul className="mt-sm flex flex-col gap-xs">
              {floor.points.map((point) => (
                <li key={point.label} className="flex items-start gap-sm">
                  {/* An icon and a word, never colour alone (BUILD_PLAN §9.7). */}
                  <span
                    aria-hidden="true"
                    className="w-[1.25em] shrink-0 text-center leading-[1.47]"
                  >
                    {point.kind === 'safety' ? '⛑' : point.kind === 'facility' ? '·' : '▸'}
                  </span>

                  <span className="min-w-0">
                    {point.label}
                    {point.kind === 'safety' ? (
                      <StatusText tone="alert" className="ml-xs">
                        Safety
                      </StatusText>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
