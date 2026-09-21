'use client';

import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * The reading-surface container.
 *
 * design.md builds sections out of full-bleed tiles where the surface change
 * itself is the divider, with no border and no shadow. That works on a
 * marketing page where each tile is a viewport tall. Here a "tile" is a shift
 * card next to a stat next to an escalation list, so the same idea is scaled
 * down: a filled card on parchment (`raised`) or an outlined card on white
 * (`flat`), and still no shadow anywhere.
 *
 * Padding is `--spacing-card`: 16px under a thumb, 14px under a mouse. The 24px
 * this started at is a marketing-tile number — on a card holding four lines of
 * a roster it spent more of the width on margin than on content.
 */

export type CardTone = 'neutral' | 'ok' | 'warn' | 'alert' | 'info';

/**
 * The accent rail. A 4px left border, not a tinted fill, because a card can
 * hold a form and a tinted fill would drag every input inside it out of the
 * contrast budget. Always paired with a word in the heading (BUILD_PLAN §9.7).
 */
const TONE_RAIL: Record<CardTone, string> = {
  neutral: '',
  ok: 'border-l-4 border-l-ok',
  warn: 'border-l-4 border-l-warn',
  alert: 'border-l-4 border-l-alert',
  info: 'border-l-4 border-l-primary',
};

export function Card({
  as: Tag = 'div',
  variant = 'raised',
  tone = 'neutral',
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  /** `raised` fills with parchment; `flat` outlines on the page surface. */
  variant?: 'raised' | 'flat';
  tone?: CardTone;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>): ReactNode {
  return (
    <Tag
      className={cx(
        'rounded-card p-card',
        variant === 'raised' ? 'bg-surface-alt' : 'border border-line bg-surface',
        TONE_RAIL[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * A card heading.
 *
 * Fixed at tagline size (18px, 17 on a mouse) rather than taking a size prop: a
 * card title is always the third level of a page, and letting each screen pick
 * its own is how the old build ended up with `text-xl` and `text-3xl` heads
 * sitting in identical cards two rows apart.
 */
export function CardTitle({
  as: Tag = 'h2',
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}): ReactNode {
  return <Tag className={cx('font-display font-semibold text-tagline', className)}>{children}</Tag>;
}
