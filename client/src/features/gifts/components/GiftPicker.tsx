import type { ReactNode } from 'react';
import { Section, LoadingRows, StatusText, cx } from '@/shared/ui';
import type { Redemption } from '../hooks/useRedemption';
export function GiftPicker({ redemption }: { redemption: Redemption }): ReactNode {
  const { gifts, selected, setSelected } = redemption;
  return (
    <Section title="Which gift?">
      {gifts.isLoading ? (
        <LoadingRows count={3} label="Loading gifts" />
      ) : (
        <div className="flex flex-col gap-xs">
          {(gifts.data ?? []).map((gift) => (
            <button
              key={gift.id}
              type="button"
              onClick={() => setSelected(gift.id)}
              aria-pressed={selected === gift.id}
              disabled={gift.outOfStock}
              className={cx(
                'flex min-h-[64px] items-center justify-between gap-sm rounded-lg border',
                'px-md py-sm text-left transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-60',
                selected === gift.id
                  ? 'border-primary bg-surface-alt shadow-[inset_0_0_0_1px_var(--color-primary)]'
                  : 'border-line bg-surface hover:bg-surface-alt',
              )}
            >
              <span className="flex min-w-0 items-center gap-xs font-semibold">
                <span
                  aria-hidden="true"
                  className={cx(
                    'w-[1ch] shrink-0 font-semibold text-primary',
                    selected === gift.id ? 'visible' : 'invisible',
                  )}
                >
                  ✓
                </span>
                <span className="truncate">{gift.name}</span>
              </span>

              {/* Stock state is words, not a colour (remediation/standards/engineering-standards.md). */}
              <StatusText
                tone={gift.outOfStock ? 'alert' : gift.lowStock ? 'warn' : 'neutral'}
                className="shrink-0"
              >
                {gift.outOfStock
                  ? 'Out of stock'
                  : gift.lowStock
                    ? `Low — ${gift.remaining} left`
                    : `${gift.remaining} left`}
              </StatusText>
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}
