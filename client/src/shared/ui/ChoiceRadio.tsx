import type { ReactNode } from 'react';
import type { ChoiceOption } from './choiceTypes';
import { cx } from './cx';
export function ChoiceRadio<T extends string>({
  option,
  name,
  value,
  onChange,
  layout,
}: {
  option: ChoiceOption<T>;
  name: string;
  value: T;
  onChange(value: T): void;
  layout: 'chips' | 'list';
}): ReactNode {
  return (
    <label className={cx(layout === 'list' ? 'block' : 'inline-flex')}>
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
  );
}
