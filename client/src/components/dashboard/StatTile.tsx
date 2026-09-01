'use client';

import type { ReactNode } from 'react';

/**
 * A single figure, with its unit stated.
 *
 * The unit is not decoration. The three counts never merge (PRODUCT_BRIEF
 * §0.1), and a dashboard that showed four bare numbers side by side would be
 * inviting someone to add them together. Every tile says what it is counting.
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
      ? 'var(--color-ok)'
      : tone === 'warn'
        ? 'var(--color-warn)'
        : tone === 'alert'
          ? 'var(--color-alert)'
          : 'var(--text)';

  return (
    <div className="tile">
      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </p>
      <p
        className={large ? 'text-6xl font-semibold' : 'text-4xl font-semibold'}
        style={{ fontFamily: 'var(--font-display)', color: toneColour, letterSpacing: '-0.01em' }}
      >
        {typeof value === 'number' ? value.toLocaleString('en-SG') : value}
      </p>
      {unit ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {unit}
        </p>
      ) : null}
      {note ? (
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A horizontal bar. Deliberately not a charting library: this is four to eight
 * bars on a screen someone glances at while walking, and a 90KB dependency
 * would be the largest thing in the bundle.
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
  const width = max > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-sm">{label}</span>
      <span
        className="h-6 flex-1 overflow-hidden rounded-sm"
        style={{ background: 'var(--color-divider)' }}
      >
        <span
          className="block h-full rounded-sm"
          style={{
            width: `${width}%`,
            background: muted ? 'var(--color-ink-subtle)' : 'var(--color-primary)',
          }}
        />
      </span>
      <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
        {value.toLocaleString('en-SG')}
        {suffix ?? ''}
      </span>
    </div>
  );
}
