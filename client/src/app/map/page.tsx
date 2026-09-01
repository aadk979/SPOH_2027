'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
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
 */
export default function MapPage(): ReactNode {
  const session = useRequireSession();
  if (!session) return null;

  return (
    <AppShell title="Floor map" back={{ href: '/home', label: 'Home' }}>
      <p className="mb-5" style={{ color: 'var(--text-muted)' }}>
        T19, School of Computing. Safety points are listed on every level.
      </p>

      <div className="flex flex-col gap-4">
        {FLOOR_MAP.map((floor) => (
          <section key={floor.level} className="tile">
            <h2 className="mb-3 text-xl font-semibold">{floor.level}</h2>
            <ul className="flex flex-col gap-2">
              {floor.points.map((point) => (
                <li key={point.label} className="flex items-start gap-3">
                  {/* An icon and a word, never colour alone (BUILD_PLAN §9.7). */}
                  <span aria-hidden="true">
                    {point.kind === 'safety' ? '⛑' : point.kind === 'facility' ? '·' : '▸'}
                  </span>
                  <span>
                    {point.label}
                    {point.kind === 'safety' ? (
                      <span
                        className="ml-2 text-sm font-semibold"
                        style={{ color: 'var(--color-alert)' }}
                      >
                        Safety
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
