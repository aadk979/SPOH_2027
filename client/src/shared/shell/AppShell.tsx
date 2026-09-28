'use client';

import { AppHeader } from './AppHeader';
import { usePathname } from 'next/navigation';
import { sectionForPath } from '@/shared/lib/navigation';
import type { ReactNode } from 'react';
import { GlobalNav } from '@/shared/shell/GlobalNav';
import { SectionNav } from '@/shared/shell/SectionNav';
import { LostPersonBanner } from '@/features/lostPerson/components/LostPersonBanner';
import { SyncWarningBanner } from '@/shared/shell/SyncIndicator';
import { cx } from '@/shared/ui/cx';

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
  capture: 'max-w-capture',

  /** Prose and forms. A measure, because long lines are hard to read. */
  reading: 'max-w-reading',

  /**
   * Dashboards, consoles and reports. Wide enough for stat rows, per-device
   * tables and bar charts; still capped, because a bar chart stretched across
   * 1920px is harder to read, not easier.
   */
  wide: 'max-w-wide',
} as const;

export type ShellWidth = keyof typeof WIDTHS;

/**
 * The frame every signed-in screen sits in.
 *
 * Order is fixed and load-bearing (remediation/phases/P07-client-refactor.md): the lost-person alert is
 * always first and always visible, then the app's own chrome, then anything the
 * volunteer must be told about their own data, then the page.
 *
 * The whole stack is sticky as a unit. Sticking the alert alone left the
 * navigation scrolling away under it; sticking the nav alone let the alert
 * scroll off, which is the one thing on this screen that must not. Together
 * they occupy a predictable strip and the page scrolls beneath.
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
  // The sub-nav tracks the content width so the title and the page it labels
  // stay on the same left edge.
  const container = cx('mx-auto w-full px-md', WIDTHS[width]);
  const pathname = usePathname();
  const section = sectionForPath(pathname);
  const parents: Record<string, string> = {
    '/guide': 'Guide',
    '/safety': 'Safety',
    '/operations': 'Operations',
  };
  const parent =
    back?.href === '/home' && parents[section] && pathname !== section
      ? { href: section, label: parents[section] }
      : back;

  return (
    <div className="flex min-h-dvh flex-col">
      {/*
        Keyboard and screen-reader users get past the chrome in one key. It
        also satisfies the "bypass blocks" criterion the axe run enforces on
        every screen (remediation/standards/engineering-standards.md).
      */}
      <a
        href="#main"
        className={cx(
          'sr-only focus:not-sr-only focus:fixed focus:top-xs focus:left-xs focus:z-[60]',
          'focus:rounded-pill focus:bg-primary focus:px-lg focus:py-sm focus:text-body',
          'focus:font-semibold focus:text-on-primary',
        )}
      >
        Skip to content
      </a>

      <div className="sticky top-0 z-40">
        <LostPersonBanner />
        <GlobalNav />

        {/*
          design.md's `sub-nav-frosted`: parchment at 80% with a backdrop blur,
          52px, category name on the left and the page's own actions on the
          right. `supports-` guards the transparency — where backdrop-filter is
          unavailable the bar stays fully opaque rather than letting the page
          scroll through it illegibly.
        */}
        <AppHeader container={container} parent={parent} title={title} actions={actions} />

        <SyncWarningBanner />
      </div>

      <div className="workspace-body">
        <SectionNav />
        <main id="main" tabIndex={-1} className={cx(container, 'workspace-main flex-1 py-lg')}>
          {children}
        </main>
      </div>
    </div>
  );
}
