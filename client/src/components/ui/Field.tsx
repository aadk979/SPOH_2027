'use client';

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cx } from './cx';

/**
 * Form controls.
 *
 * Every input in the old build carried the same six-line inline style, and no
 * two of them agreed on a height (48, 56, or none at all). They come in three
 * named scales now, all driven by `--spacing-field` and `--text-control`, which
 * step down under a mouse.
 *
 * On touch the text is 16px and the box is 48px: 16 is the threshold below
 * which iOS zooms the viewport on focus, and that zoom is what made the sign-in
 * screen jump on an iPhone. Under a `pointer: fine` device neither rule applies,
 * so both compress.
 *
 * The control grammar is design.md's: `{rounded.md}` on rectangles, hairline
 * border, Action Blue focus ring from the global `:focus-visible` rule.
 */

const CONTROL =
  'w-full rounded-md border border-line bg-surface px-md py-sm text-text ' +
  'placeholder:text-text-subtle transition-colors hover:border-text-subtle ' +
  'disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-text-subtle';

/**
 * Size is a prop, never a `className`.
 *
 * Tailwind resolves two `text-*` or two `min-h-*` utilities by their order in
 * the generated stylesheet, not by their order in the class attribute — so an
 * override passed in from outside is a coin toss that happens to land the right
 * way today. Everything that would collide lives in this map instead.
 *
 * `body` is 17px, which is also what keeps iOS from zooming the viewport on
 * focus; nothing here may go below 16px.
 */
const CONTROL_SCALE = {
  /** The default. A thumb's target on touch, a text field's height on a mouse. */
  md: 'min-h-field text-control',
  /** A field typed into while somebody watches — the card code at the desk. */
  lg: 'min-h-control-lg text-lead',
  /** Transcribed CSV, where column alignment is how a missing comma is spotted. */
  mono: 'text-caption font-mono [font-variant-ligatures:none]',
} as const;

export type ControlScale = keyof typeof CONTROL_SCALE;

/**
 * Label, optional hint, control, optional error — in that order, and wired
 * together by id.
 *
 * The hint is rendered before the control and referenced by `aria-describedby`,
 * so "Describe the event, not the people. No names." reaches a screen-reader
 * user at the moment they focus the box rather than after they have typed a
 * name into it.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional = false,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  className?: string;
  /** Receives the wiring: `id`, `aria-describedby`, `aria-invalid`. */
  children(props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
  }): ReactNode;
}): ReactNode {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('flex flex-col gap-xs', className)}>
      <label htmlFor={id} className="text-body font-semibold">
        {label}
        {optional ? <span className="ml-xs font-normal text-text-muted">(optional)</span> : null}
      </label>

      {hint ? (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      ) : null}

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}

      {error ? (
        <p id={errorId} role="alert" className="text-caption font-semibold text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  scale = 'md',
  className,
  ...rest
}: { scale?: ControlScale } & InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input className={cx(CONTROL, CONTROL_SCALE[scale], className)} {...rest} />;
}

export function Textarea({
  scale = 'md',
  className,
  rows = 3,
  ...rest
}: { scale?: ControlScale } & TextareaHTMLAttributes<HTMLTextAreaElement>): ReactNode {
  return (
    <textarea
      rows={rows}
      className={cx(CONTROL, CONTROL_SCALE[scale], 'resize-y', className)}
      {...rest}
    />
  );
}

/**
 * The chevron, as a data URI.
 *
 * `appearance-none` alone leaves a control with no affordance at all on Windows
 * and Android, so the arrow is painted back as a background image — inline SVG,
 * because the CSP allows `img-src data:` but no CDN.
 *
 * Every space is percent-encoded and the whole thing is a constant rather than
 * a literal in the class list. A raw `bg-[url("…viewBox='0 0 12 8'…")]` looks
 * like one class and is not: the browser splits a `class` attribute on
 * whitespace, so it arrived as a dozen nonsense tokens and the arrow silently
 * never rendered.
 */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2012%208'%3E%3Cpath%20d='M1%201.5%206%206.5l5-5'%20stroke='%237a7a7a'%20stroke-width='1.75'%20fill='none'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E\")";

/** A select, with the native chevron replaced by a drawn one. */
export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  return (
    <select
      // The chevron is the one thing here that cannot be a utility: see CHEVRON.
      style={{
        backgroundImage: CHEVRON,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 17px center',
        backgroundSize: '14px',
      }}
      className={cx(CONTROL, CONTROL_SCALE.md, 'cursor-pointer appearance-none pr-xxl', className)}
      {...rest}
    >
      {children}
    </select>
  );
}

/**
 * A checkbox and its label as one 44px row.
 *
 * The box itself renders at 20px on every platform; the target is the whole
 * row, which is what makes "Only items still held" tappable at the lost-and-
 * found desk without aiming.
 */
export function Checkbox({
  label,
  className,
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return (
    <label
      className={cx(
        'flex min-h-control cursor-pointer items-center gap-sm text-body select-none has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        className="size-[18px] shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}
