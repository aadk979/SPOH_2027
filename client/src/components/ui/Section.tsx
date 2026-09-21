'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * A titled band of a page.
 *
 * The heading is 14px, weight 600, uppercase, tracked out and muted — the same
 * every time. Before this, "Your station", "Oversight", "Everyone", "Who is
 * arriving" and eleven others each re-declared that string of five classes plus
 * an inline colour, and three of them had already drifted.
 *
 * The heading level is a prop rather than a fixture: the outline of a page is
 * how a screen-reader user navigates it, and a section nested inside a card
 * must not claim to be a sibling of the page title.
 */
export function Section({
  title,
  /** Sits under the heading, above the content. For a caveat about the data. */
  description,
  headingLevel = 2,
  actions,
  className,
  children,
}: {
  title?: string;
  description?: string;
  headingLevel?: 2 | 3;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <section className={cx('min-w-0', className)}>
      {title ? (
        <div className="mb-sm flex items-center justify-between gap-sm">
          <Heading className="text-caption font-semibold tracking-[0.06em] text-text-muted uppercase">
            {title}
          </Heading>
          {actions}
        </div>
      ) : null}

      {description ? <p className="mb-sm text-caption text-text-muted">{description}</p> : null}

      {children}
    </section>
  );
}

/**
 * The page's vertical rhythm.
 *
 * design.md stacks tiles with 80px between them. That is a marketing page where
 * each tile is a viewport tall; an ops screen scrolled with a thumb wants the
 * next section already visible at the bottom edge, so this runs at a flat 24px
 * and lets the section headings carry the separation instead.
 */
export function Stack({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): ReactNode {
  return <div className={cx('flex flex-col gap-lg', className)}>{children}</div>;
}

/**
 * The responsive card grid used by every tile list and stat row.
 *
 * Columns are capped by content, not by breakpoint alone: three stat tiles
 * stretched across a 1600px console is three very wide boxes of white space,
 * so `wide` stops at four and the container caps the row.
 */
export function CardGrid({
  columns = 3,
  className,
  children,
}: {
  columns?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const template =
    columns === 2
      ? 'sm:grid-cols-2'
      : columns === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return <div className={cx('grid gap-sm', template, className)}>{children}</div>;
}
