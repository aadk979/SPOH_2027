'use client';

import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * Pick one of a few.
 *
 * Incident type, incident severity, announcement priority, fallback tier,
 * import target and import source were six hand-written copies of the same
 * control, each with its own padding and its own selected-state colours. One
 * component now, in two layouts.
 *
 * Built on real radio inputs rather than `aria-pressed` buttons. A radio group
 * is what this actually is, and using the native element buys arrow-key
 * navigation, roving focus and a screen-reader announcement of "2 of 4,
 * selected" that a row of toggle buttons cannot express. The input is visually
 * hidden, not `display:none`, so it stays focusable and the ring can be drawn
 * on the label it controls.
 *
 * The selected state is never colour alone: the chip inverts to a filled pill
 * and the list row gains a 2px ring plus a check glyph, so it survives
 * greyscale and reads correctly at a glance in a bright hall (BUILD_PLAN §9.7).
 */

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** A second line, `list` layout only. Explains what picking this means. */
  hint?: string;
  disabled?: boolean;
}

export function ChoiceGroup<T extends string>({
  legend,
  hint,
  name,
  value,
  options,
  onChange,
  layout = 'chips',
  className,
}: {
  legend: string;
  hint?: string;
  /** Must be unique on the page — it is what groups the radios. */
  name: string;
  value: T;
  /**
   * `NoInfer` on everything but `value`, so `value` alone fixes `T`.
   *
   * Passing a `useState` setter straight to `onChange` is the obvious call site
   * and it used to break inference: the setter takes `SetStateAction<T>`, which
   * is `T | ((prev: T) => T)`, so inferring from the parameter produced a
   * candidate containing a function, that failed `T extends string`, and `T`
   * silently fell back to the constraint — leaving every caller with an
   * `onChange` that only accepted `string`.
   */
  options: ReadonlyArray<ChoiceOption<NoInfer<T>>>;
  onChange(value: NoInfer<T>): void;
  layout?: 'chips' | 'list';
  className?: string;
}): ReactNode {
  return (
    <fieldset className={cx('min-w-0', className)}>
      <legend className="text-body font-semibold">{legend}</legend>
      {hint ? <p className="mt-xxs text-caption text-text-muted">{hint}</p> : null}

      <div
        className={cx(
          'mt-sm',
          layout === 'chips' ? 'flex flex-wrap gap-xs' : 'flex flex-col gap-xs',
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cx(layout === 'list' ? 'block' : 'inline-flex')}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />

            {layout === 'chips' ? (
              <span
                className={cx(
                  'flex min-h-control cursor-pointer items-center rounded-pill border border-line',
                  'bg-surface px-md py-xs text-body transition-colors',
                  'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-on-primary',
                  'peer-checked:font-semibold',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                  'peer-focus-visible:outline-primary-focus',
                  'peer-disabled:cursor-not-allowed peer-disabled:opacity-45',
                )}
              >
                {option.label}
              </span>
            ) : (
              <span
                className={cx(
                  'flex min-h-control-lg cursor-pointer items-baseline gap-sm rounded-card border',
                  'border-line bg-surface px-md py-xs transition-colors',
                  'peer-checked:border-primary peer-checked:bg-surface-alt',
                  'peer-checked:shadow-[inset_0_0_0_1px_var(--color-primary)]',
                  'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                  'peer-focus-visible:outline-primary-focus',
                  'peer-disabled:cursor-not-allowed peer-disabled:opacity-45',
                )}
              >
                {/*
                  The glyph is the greyscale-safe half of the selected state.
                  Hidden from assistive tech because the radio already says
                  "selected" — announcing it twice is noise, not clarity.
                */}
                <span
                  aria-hidden="true"
                  className={cx(
                    'w-[1ch] shrink-0 font-semibold text-primary',
                    value === option.value ? 'visible' : 'invisible',
                  )}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{option.label}</span>
                  {option.hint ? (
                    <span className="block text-caption text-text-muted">{option.hint}</span>
                  ) : null}
                </span>
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
