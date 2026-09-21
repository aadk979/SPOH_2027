'use client';

import type { ReactNode } from 'react';
import { formatCount } from '@/lib/format';
import { Card, cx } from '@/components/ui';

/**
 * A single figure, with its unit stated.
 *
 * The unit is not decoration. The three counts never merge (PRODUCT_BRIEF
 * §0.1), and a dashboard that showed four bare numbers side by side would be
 * inviting someone to add them together. Every tile says what it is counting.
 *
 * The figure used to be `text-6xl` — 60px, fixed, at every width. On a phone
 * that pushed the unit label below the fold, which quietly removed the one
 * thing keeping the counts apart. It is now the design.md display-lg ceiling
 * (40px) and scales down with the viewport.
 */
export function StatTile({
  label,
  value,
  unit,
  note,
  tone = 'neutral',
  large = false,
}: {
  label: string;
  value: number | string;
  /** "registrations", "room entries", "cards" — never omitted on a count. */
  unit?: string;
  note?: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'alert';
  large?: boolean;
}): ReactNode {
  const toneColour =
    tone === 'ok'
      ? 'text-ok'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'alert'
          ? 'text-alert'
          : 'text-text';

  return (
    <Card className="flex flex-col">
      <p className="text-caption font-semibold tracking-[0.06em] text-text-muted uppercase">
        {label}
      </p>

      <p
        className={cx(
          'mt-xxs font-display font-semibold tabular-nums',
          large ? 'text-stat-lg' : 'text-stat',
          toneColour,
        )}
      >
        {typeof value === 'number' ? formatCount(value) : value}
      </p>

      {/* The unit sits directly under the figure with no gap: it is part of
          the number, not a caption about it. */}
      {unit ? <p className="text-caption text-text-muted">{unit}</p> : null}
      {note ? <p className="mt-xs text-caption text-text-muted">{note}</p> : null}
    </Card>
  );
}

/**
 * A horizontal bar. Deliberately not a charting library: this is four to eight
 * bars on a screen someone glances at while walking, and a 90KB dependency
 * would be the largest thing in the bundle.
 *
 * The label column used to be a fixed 160px, which on a 360px phone left 90px
 * for the bar and the number together — every bar looked full. It is now a
 * grid that gives the label a third of the row on a phone and a fixed measure
 * once there is room, and the label wraps to two lines instead of truncating a
 * station name down to "DCDF Stat…".
 */
export function BarRow({
  label,
  value,
  max,
  suffix,
  muted = false,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  muted?: boolean;
}): ReactNode {
  const width = max > 0 && value > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-sm gap-y-xxs sm:grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_auto]">
      <span className="min-w-0 text-caption">{label}</span>

      {/*
        The bar is `order-last` on a phone so it spans the full width beneath
        the label and figure, rather than being squeezed between them.
      */}
      <span className="order-last col-span-2 h-[10px] overflow-hidden rounded-pill bg-line-soft sm:order-none sm:col-span-1 sm:h-[20px] sm:rounded-sm">
        <span
          // The one runtime-computed value in the app, and the only surviving
          // inline style: a percentage cannot be a utility class.
          style={{ width: `${width}%` }}
          className={cx(
            'block h-full rounded-pill sm:rounded-sm',
            muted ? 'bg-text-subtle' : 'bg-primary',
          )}
        />
      </span>

      <span className="text-right text-caption font-semibold tabular-nums">
        {formatCount(value)}
        {suffix ?? ''}
      </span>
    </div>
  );
}

/** The container every bar list sits in, so the gaps agree across screens. */
export function BarList({ children }: { children: ReactNode }): ReactNode {
  return <Card className="flex flex-col gap-sm">{children}</Card>;
}
