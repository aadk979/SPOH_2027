'use client';
import type { ReactNode } from 'react';
import { useOptionalEvent } from '@/shared/lib/eventContext';
import { cx } from '@/shared/ui/cx';

/** Persistent practice identification, beneath urgent safety alerts. */
export function RehearsalBanner({ display = false }: { display?: boolean }): ReactNode {
  const event = useOptionalEvent();
  if (event?.status !== 'REHEARSAL') return null;
  return (
    <aside
      role="note"
      aria-label="Rehearsal mode"
      className={cx(
        'bg-warn-surface px-md py-sm text-warn',
        display ? 'text-tv-row' : 'text-caption',
      )}
    >
      <strong>REHEARSAL · Practice captures, cards and stock.</strong> Reports and dashboards
      exclude practice by default.
    </aside>
  );
}
