'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useState, type ReactNode } from 'react';
import type { GiftTypeRecord, RedeemGiftResponse } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { CardCodeInput } from '@/components/CardCodeInput';
import {
  Button,
  Callout,
  EmptyState,
  LoadingRows,
  Section,
  StatusText,
  cx,
  type Tone,
} from '@/components/ui';
import { useQrScanner } from '@/features/capture/useQrScanner';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { ApiError, api } from '@/lib/api';

/**
 * Gift redemption (PRODUCT_BRIEF §5).
 *
 * The physical stamped card authorises the gift; the scan is a cross-check.
 * A card that will not scan must never stop a visitor who has walked the whole
 * journey — so the code is optional here, and every soft problem is a warning
 * the volunteer can override rather than a wall.
 *
 * Out of stock is the one hard stop, and it renders as an explicit state rather
 * than a silent failure.
 */
export default function RedeemPage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const station = me?.currentAssignment?.station;

  const gifts = useQuery({
    queryKey: ['gifts'],
    queryFn: async () => {
      const result = await api<{ data: GiftTypeRecord[] }>('/gifts');
      return result.data;
    },
    enabled: session !== null,
    refetchInterval: 15_000,
  });

  const redeem = useCallback(
    async (cardShortCode?: string): Promise<void> => {
      if (!station || !selected || pending) return;
      setPending(true);
      setMessage(null);

      try {
        const result = await api<RedeemGiftResponse>('/gifts/redemptions', {
          method: 'POST',
          body: {
            giftTypeId: selected,
            stationId: station.id,
            ...(cardShortCode ? { cardShortCode } : {}),
            idempotencyKey: crypto.randomUUID(),
            clientRecordedAt: new Date().toISOString(),
          },
        });

        navigator.vibrate?.(15);
        await gifts.refetch();

        setMessage(
          result.warning
            ? { tone: 'warn', text: result.warning }
            : {
                tone: 'ok',
                text: `${result.giftType.name} redeemed. ${result.giftType.remaining} left.`,
              },
        );
      } catch (error) {
        setMessage({
          tone: 'alert',
          text:
            error instanceof ApiError
              ? error.message
              : 'Could not reach the server. Hand over the gift and tell your IC.',
        });
      } finally {
        setPending(false);
      }
    },
    [station, selected, pending, gifts],
  );

  const onDecode = useCallback(
    (text: string): void => {
      const cleaned = text.trim();
      const shortCode = /^[0-9A-HJ-NP-Z]{6}$/i.test(cleaned)
        ? cleaned.toUpperCase()
        : cleaned.split(':').pop()?.slice(0, 6).toUpperCase();
      if (shortCode) void redeem(shortCode);
    },
    [redeem],
  );

  const scanner = useQrScanner({ onDecode });

  if (!session) return null;

  if (!station) {
    return (
      <AppShell width="capture" title="Redeem a gift" back={{ href: '/home', label: 'Home' }}>
        <EmptyState title="Redemption is closed">
          You are not on shift right now, so gifts cannot be redeemed from this device.
        </EmptyState>
      </AppShell>
    );
  }

  return (
    <AppShell width="capture" title="Redeem a gift" back={{ href: '/home', label: 'Home' }}>
      <div className="flex flex-col gap-lg">
        <p className="text-caption text-text-muted">
          Check the stamps on the physical card first. The scan is a cross-check, not a gate.
        </p>

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

                  {/* Stock state is words, not a colour (BUILD_PLAN §9.7). */}
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

        {selected ? (
          <Section title="Scan the card, or hand it over without one">
            <div className="flex flex-col gap-md">
              <CardCodeInput
                videoRef={scanner.videoRef}
                scannerState={scanner.state}
                onSubmitCode={(code) => void redeem(code)}
                pending={pending}
              />

              <Button
                variant="quiet"
                size="lg"
                block
                disabled={pending}
                onClick={() => void redeem()}
              >
                Redeem without a card code
              </Button>
            </div>
          </Section>
        ) : (
          <p className="text-text-muted">Pick a gift to continue.</p>
        )}

        {message ? (
          <Callout tone={message.tone} role="status">
            <span className="font-semibold">{message.text}</span>
          </Callout>
        ) : null}
      </div>
    </AppShell>
  );
}
