'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from './ui/cx';

/**
 * A navigation tile on the home screen.
 *
 * This is the fix for the home screen looking like a wall of boxes. Every tile
 * used to be a `.capture-target` — the 88px-minimum, weight-600, 22px-label
 * booth control — which is correct for a button pressed hundreds of times an
 * hour without being looked at, and wrong for a link tapped once a shift while
 * reading it.
 *
 * A nav tile is sized by its content instead: a body-size label, a caption hint
 * and a `--spacing-tile` floor — 64px under a thumb, 52px under a mouse, both
 * still clear of the touch target. Eight fit a phone screen where four used to.
 *
 * `emphasis="primary"` marks the tiles this posting exists to do — the capture
 * screens. They get the Action Blue rule down their left edge, which is enough
 * to separate them from the universal tiles without a second colour or a
 * heavier weight.
 */
export function NavTile({
  href,
  label,
  hint,
  emphasis = 'default',
}: {
  href: string;
  label: string;
  hint: string;
  emphasis?: 'default' | 'primary';
}): ReactNode {
  return (
    <Link
      href={href}
      className={cx(
        'flex min-h-tile flex-col justify-center gap-[2px] rounded-card border border-line',
        'bg-surface px-md py-xs no-underline transition-[transform,background-color,border-color]',
        'duration-75 ease-[cubic-bezier(0.2,0,0.2,1)] hover:bg-surface-alt hover:border-text-subtle active:scale-[0.98]',
        'active:bg-surface-alt [touch-action:manipulation]',
        '[-webkit-tap-highlight-color:transparent]',
        emphasis === 'primary' && 'border-l-4 border-l-primary',
      )}
    >
      <span className="text-body font-semibold text-text">{label}</span>
      <span className="text-caption text-text-muted">{hint}</span>
    </Link>
  );
}
