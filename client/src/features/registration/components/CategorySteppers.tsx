import type { ReactNode } from 'react';
import type { GroupRegistrationForm } from '../hooks/useGroupRegistration';
import { cx } from '@/shared/ui';
import { CATEGORIES } from '../model/categories';
import { Stepper } from './Stepper';
export function CategorySteppers({ form }: { form: GroupRegistrationForm }): ReactNode {
  const { counts, adjust } = form;
  return (
    <ul className="flex flex-col gap-xxs">
      {CATEGORIES.map((category) => {
        const count = counts[category.value] ?? 0;
        return (
          <li
            key={category.value}
            className={cx(
              'flex items-center justify-between gap-sm rounded-lg px-md py-xs transition-colors',
              // The filled row is how a volunteer checks the composition at
              // a glance before committing four rows to the dataset.
              count > 0 ? 'bg-surface-alt' : 'bg-transparent',
            )}
          >
            <span className={cx('min-w-0', count > 0 && 'font-semibold')}>{category.label}</span>

            <span className="flex shrink-0 items-center gap-sm">
              <Stepper
                label={`Remove one ${category.label}`}
                glyph="−"
                variant="quiet"
                onClick={() => adjust(category.value, -1)}
                disabled={count === 0}
              />

              {/*
                    `aria-live` on the number rather than the row: a screen
                    reader should hear "3" after a tap, not the whole row again.
                  */}
              <span
                className="w-[2ch] text-center text-tagline font-semibold tabular-nums"
                aria-live="polite"
              >
                {count}
              </span>

              <Stepper
                label={`Add one ${category.label}`}
                glyph="+"
                variant="primary"
                onClick={() => adjust(category.value, 1)}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
