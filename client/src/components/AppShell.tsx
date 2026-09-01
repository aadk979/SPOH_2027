'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LostPersonBanner } from './LostPersonBanner';
import { SyncWarningBanner } from './SyncIndicator';

/**
 * How wide the content column may grow.
 *
 * One width for every screen was wrong: a phone-sized column is right for a
 * thumb-driven capture screen and absurd for a dashboard, which on a laptop
 * ended up using 40% of the display with 576px of dead space on either side.
 *
 * These are maximums. Below them every screen is full width, so nothing here
 * changes anything on a phone — which is still the device that matters most.
 */
const WIDTHS = {
  /**
   * Capture. Generous enough to fill a booth tablet in landscape, capped so the
   * eight category buttons stay a comfortable thumb-arc apart rather than
   * spreading across a monitor.
   */
  capture: 'max-w-4xl',

  /** Prose and forms. A measure, because long lines are hard to read. */
  reading: 'max-w-3xl',

  /**
   * Dashboards, consoles and reports. Wide enough for stat rows, per-device
   * tables and bar charts; still capped, because a bar chart stretched across
   * 1920px is harder to read, not easier.
   */
  wide: 'max-w-[1600px]',
} as const;

export type ShellWidth = keyof typeof WIDTHS;

/**
 * The frame every signed-in screen sits in.
 *
 * Order is fixed and load-bearing (BUILD_PLAN §9.3): the lost-person alert is
 * always first and always visible, then anything the volunteer must be told
 * about their own data, then the page.
 */
export function AppShell({
  title,
  back,
  actions,
  width = 'reading',
  children,
}: {
  title: string;
  /** Where the back link goes. Omit on the home screen. */
  back?: { href: string; label: string };
  actions?: ReactNode;
  /** Defaults to a reading measure; dashboards should ask for `wide`. */
  width?: ShellWidth;
  children: ReactNode;
}): ReactNode {
  // The header tracks the content width so the title and the page it labels
  // stay on the same left edge.
  const container = `mx-auto w-full ${WIDTHS[width]}`;

  return (
    <div className="min-h-dvh">
      <LostPersonBanner />
      <SyncWarningBanner />

      <header
        className="border-b px-4 py-3"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
      >
        <div className={`${container} flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            {back ? (
              <Link href={back.href} className="text-sm" style={{ color: 'var(--color-primary)' }}>
                ← {back.label}
              </Link>
            ) : null}
            <h1
              className="truncate text-xl font-semibold"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
            >
              {title}
            </h1>
          </div>
          {actions}
        </div>
      </header>

      <main className={`${container} px-4 py-6`}>{children}</main>
    </div>
  );
}
