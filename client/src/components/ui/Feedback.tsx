'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';
import { Card } from './Card';

/**
 * Loading and empty states.
 *
 * Every screen used to render the bare word "Loading…" in muted grey, which on
 * a dashboard means the page height collapses and then jumps by 600px when the
 * data lands — on a phone that is a mis-tap on whatever moved under the thumb.
 * Skeletons hold the space the content is about to take.
 */

export function Skeleton({
  /**
   * Any CSS length. A prop rather than an `h-*` class, because a default height
   * in the base classes and an override in `className` are two `h-*` utilities,
   * and Tailwind picks between them by stylesheet order rather than by the
   * order they were written.
   */
  height = '1.25em',
  className,
}: {
  height?: string;
  className?: string;
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      style={{ height }}
      className={cx('block animate-pulse rounded-md bg-line', className)}
    />
  );
}

/**
 * A stand-in for a grid of cards.
 *
 * `aria-busy` on a labelled region, rather than a visually-hidden "Loading"
 * string: a screen reader announces the state of the region it is in, and the
 * skeleton bars themselves stay hidden so nothing reads out a row of blanks.
 */
export function LoadingCards({
  count = 3,
  label = 'Loading',
}: {
  count?: number;
  label?: string;
}): ReactNode {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <Skeleton className="w-1/2" />
          <Skeleton height="2em" className="mt-sm w-2/3" />
          <Skeleton className="mt-xs w-1/3" />
        </Card>
      ))}
    </div>
  );
}

/** A stand-in for a stack of rows. */
export function LoadingRows({
  count = 4,
  label = 'Loading',
}: {
  count?: number;
  label?: string;
}): ReactNode {
  return (
    <Card role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-sm">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={index % 2 === 0 ? 'w-full' : 'w-4/5'} />
      ))}
    </Card>
  );
}

/**
 * Nothing to show — and why, plus a way out where one exists.
 *
 * "Nothing yet." on its own is a dead end. Every empty state on an ops screen
 * is either expected (no announcements before the event opens) or a symptom
 * (no shifts assigned), and the two need different words.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}): ReactNode {
  return (
    <Card className="text-center">
      <p className="text-tagline font-semibold">{title}</p>
      {children ? <div className="mt-xs text-body text-text-muted">{children}</div> : null}
      {action ? <div className="mt-md flex justify-center">{action}</div> : null}
    </Card>
  );
}
