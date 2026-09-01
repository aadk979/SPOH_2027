'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LostPersonBanner } from './LostPersonBanner';
import { SyncWarningBanner } from './SyncIndicator';

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
  children,
}: {
  title: string;
  /** Where the back link goes. Omit on the home screen. */
  back?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="min-h-dvh">
      <LostPersonBanner />
      <SyncWarningBanner />

      <header
        className="border-b px-4 py-3"
        style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
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

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
