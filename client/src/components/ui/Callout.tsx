'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';

export type Tone = 'ok' | 'warn' | 'alert' | 'info' | 'neutral';

/**
 * A tinted message block.
 *
 * The same four-branch ternary that mapped a tone to a background and a
 * foreground was written out by hand on the stamp, redeem, footfall, imports
 * and lost-person screens, each with slightly different padding. Once, here.
 *
 * The glyph is not decoration. Every tone pairs its colour with a mark and a
 * word so the state survives a greyscale phone, a colour-blind reader and a
 * screen reader (BUILD_PLAN §9.7) — it is `aria-hidden` precisely because the
 * text beside it already carries the meaning.
 */
const TONES: Record<Tone, { box: string; glyph: string }> = {
  ok: { box: 'bg-ok-surface text-ok', glyph: '✓' },
  warn: { box: 'bg-warn-surface text-warn', glyph: '▲' },
  alert: { box: 'bg-alert-surface text-alert', glyph: '■' },
  info: { box: 'bg-surface-alt text-text', glyph: 'ℹ' },
  neutral: { box: 'bg-surface-alt text-text-muted', glyph: '·' },
};

export function Callout({
  tone = 'info',
  title,
  role,
  live,
  className,
  children,
}: {
  tone?: Tone;
  title?: string;
  /**
   * `alert` interrupts a screen reader mid-sentence. Reserve it for something
   * the volunteer must act on now — a failed submit, not a search result count.
   */
  role?: 'status' | 'alert';
  live?: 'polite' | 'assertive';
  className?: string;
  children: ReactNode;
}): ReactNode {
  const { box, glyph } = TONES[tone];

  return (
    <div
      role={role}
      aria-live={live}
      className={cx('flex gap-sm rounded-lg px-md py-sm text-body', box, className)}
    >
      <span aria-hidden="true" className="pt-[2px] leading-none select-none">
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cx(title && 'mt-xxs')}>{children}</div>
      </div>
    </div>
  );
}

/**
 * A word carrying a state, in the tone's colour.
 *
 * Used for "Held", "Checked in", "Out of stock". The colour is the second
 * signal; the word is the first, which is why this takes a string rather than
 * rendering a dot.
 */
export function StatusText({
  tone,
  className,
  children,
}: {
  tone: Tone;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const colour =
    tone === 'ok'
      ? 'text-ok'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'alert'
          ? 'text-alert'
          : 'text-text-muted';

  return <span className={cx('text-caption font-semibold', colour, className)}>{children}</span>;
}
