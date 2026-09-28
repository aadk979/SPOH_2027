'use client';

import type { ReactNode } from 'react';
import { ChoiceRadio } from './ChoiceRadio';
import { cx } from '@/shared/ui/cx';

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
 * greyscale and reads correctly at a glance in a bright hall (remediation/standards/engineering-standards.md).
 */

import type { ChoiceOption } from './choiceTypes';
export type { ChoiceOption } from './choiceTypes';

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
          <ChoiceRadio
            key={option.value}
            option={option}
            name={name}
            value={value}
            onChange={onChange}
            layout={layout}
          />
        ))}
      </div>
    </fieldset>
  );
}
