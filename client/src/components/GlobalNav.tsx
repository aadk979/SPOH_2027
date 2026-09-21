'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { clientEnv } from '@/lib/env';
import { signOut } from '@/lib/session';
import { useCurrentSession } from '@/features/session/useSession';
import { cx } from './ui/cx';

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
  const router = useRouter();
  const pathname = usePathname();
  const session = useCurrentSession();

  /**
   * Sign out on the server as well as locally.
   *
   * Dropping the in-memory token alone would leave the refresh cookie in place,
   * and the next page load would silently restore the session — on a phone that
   * has just been handed to somebody else, which is the exact moment this
   * button gets pressed.
   *
   * The local token is dropped synchronously inside `signOut()`, so the UI is
   * already signed out while the request is in flight. The redirect waits for
   * that request: the cookie is httpOnly and only the server can clear it, and
   * leaving before it does would let the next page load sign them straight back
   * in — on a phone that has just been handed to somebody else.
   */
  function onSignOut(): void {
    void signOut().finally(() => router.replace('/sign-in'));
  }

  return (
    <nav
      aria-label="Global"
      className="flex min-h-nav flex-nowrap items-center gap-xs sm:gap-sm bg-void px-xs sm:px-md text-fine text-on-dark"
    >
      <Link
        href="/home"
        className="flex min-h-[44px] items-center whitespace-nowrap font-semibold tracking-[-0.01em] text-on-dark no-underline transition-colors hover:text-primary-on-dark focus-visible:outline-primary-on-dark"
      >
        SPOH 2027
      </Link>

      {/*
        Which backend this build is pointed at. Shown everywhere except
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

      {session ? (
        <>
          <Link
            href="/inbox"
            aria-current={pathname === '/inbox' ? 'page' : undefined}
            className={cx(
              'flex min-h-[44px] items-center px-xs text-on-dark no-underline transition-colors shrink-0',
              'hover:text-primary-on-dark focus-visible:outline-primary-on-dark',
              pathname === '/inbox' && 'font-semibold text-primary-on-dark',
            )}
          >
            Announcements
          </Link>
          {/* The name is confirmation you are on your own account, not a link.
              Hidden on the narrowest phones, where the sign-out target matters
              more than the label. */}
          <span className="hidden max-w-[24ch] truncate text-on-dark-muted sm:inline">
            {session.displayName}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className={cx(
              'min-h-[44px] whitespace-nowrap rounded-sm bg-tile-dark px-sm text-fine text-on-dark shrink-0',
              'transition-[transform,background-color] duration-75 hover:bg-tile-dark-2 active:scale-[0.95]',
              'focus-visible:outline-primary-on-dark',
            )}
          >
            Sign out
          </button>
        </>
      ) : null}
    </nav>
  );
}
