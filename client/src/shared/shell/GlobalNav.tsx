'use client';

import { AppLink as Link } from '@/shared/lib/AppLink';
import { useAppPathname } from '@/shared/lib/appPath';
import type { ReactNode } from 'react';
import { getClientEnv } from '@/shared/lib/env';
import { useCurrentSession } from '@/features/session';
import { EventSwitcher } from '@/features/events';
import { useOptionalEvent } from '@/shared/lib/eventContext';
import { cx } from '@/shared/ui/cx';
import { globalEntries } from '@/navigation';
import { SignOutButton } from './SignOutButton';

/**
 * The persistent top bar (design.md `global-nav`).
 *
 * 44px, true black, 12px links — the one place pure black appears. It is the
 * only chrome the app had none of: every screen used to be a dead end with a
 * text "← Home" and nothing else, so on a laptop there was no way to tell one
 * page of the app from a different app.
 *
 * What lives here is what must be reachable from every screen and belongs to
 * the person rather than the page: who you are signed in as, and how to sign
 * out of a phone that is about to be handed to somebody else. Page-level
 * actions belong in the sub-nav below it.
 *
 * Deliberately no search field. The footfall screen's contract is that it
 * contains no text input at all — a volunteer counting one-handed must not be
 * one mis-tap from a keyboard covering the counter (BUILD_PLAN §9.4), and the
 * e2e suite asserts it.
 */
export function GlobalNav(): ReactNode {
  const pathname = useAppPathname();
  const session = useCurrentSession();
  const event = useOptionalEvent();
  const clientEnv = getClientEnv();

  return (
    <nav
      aria-label="Global"
      className="flex min-h-nav flex-nowrap items-center gap-xs sm:gap-sm bg-void px-xs sm:px-md text-fine text-on-dark"
    >
      <Link
        href="/home"
        className="flex min-h-[44px] items-center whitespace-nowrap font-semibold tracking-[-0.01em] text-on-dark no-underline transition-colors hover:text-primary-on-dark focus-visible:outline-primary-on-dark"
      >
        {event?.name ?? 'Home'}
      </Link>

      {/*
        Which backend this session is pointed at. Shown everywhere except
        production, because the single most expensive mistake in a rehearsal is
        entering real counts into staging — or worse, staging counts into real.
      */}
      {clientEnv.envLabel !== 'production' ? (
        <span className="rounded-xs bg-tile-dark px-xs py-[2px] text-micro tracking-[0.08em] text-on-dark-muted uppercase shrink-0">
          <span className="hidden sm:inline">{clientEnv.envLabel}</span>
          <span className="sm:hidden" title={clientEnv.envLabel}>
            {clientEnv.envLabel === 'development' ? 'Dev' : clientEnv.envLabel}
          </span>
        </span>
      ) : null}

      <span className="flex-1 min-w-0" />

      {session ? <EventSwitcher /> : null}

      {session ? (
        <>
          {globalEntries().map((entry) => (
            <Link
              key={entry.path}
              href={entry.path}
              aria-current={pathname === entry.path ? 'page' : undefined}
              className={cx(
                'flex min-h-[44px] items-center px-xs text-on-dark no-underline transition-colors shrink-0',
                'hover:text-primary-on-dark focus-visible:outline-primary-on-dark',
                pathname === entry.path && 'font-semibold text-primary-on-dark',
              )}
            >
              {/* The whole bar must fit 320 px without scrolling: wider content
                  makes phones zoom the page out, which throws off every tap on the
                  fixed bottom nav. The short label is the one that fits. */}
              <span className="max-[359px]:hidden">{entry.label}</span>
              <span className="hidden max-[359px]:inline">{entry.shortLabel ?? entry.label}</span>
            </Link>
          ))}
          {/* The name is confirmation you are on your own account, not a link.
              Hidden on the narrowest phones, where the sign-out target matters
              more than the label. */}
          <span className="hidden max-w-[24ch] truncate text-on-dark-muted sm:inline">
            {session.displayName}
          </span>
          {/* Sign out on the server as well as locally, and not past captures
              still on the phone (useSignOutGuard). */}
          <SignOutButton />
        </>
      ) : null}
    </nav>
  );
}
