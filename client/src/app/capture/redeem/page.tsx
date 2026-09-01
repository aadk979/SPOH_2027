'use client';

import { useQuery } from '@tanstack/react-query';
import { useCallback, useState, type ReactNode } from 'react';
import type { GiftTypeRecord, RedeemGiftResponse } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { CardCodeInput } from '@/components/CardCodeInput';
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
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(
    null,
  );
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
          tone: 'error',
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
        <p className="tile">You are not on shift right now, so redemption is closed.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Redeem a gift" back={{ href: '/home', label: 'Home' }}>
      <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        Check the stamps on the physical card first. The scan is a cross-check, not a gate.
      </p>

      <h2 className="mb-2 font-semibold">Which gift?</h2>
      <div className="mb-6 flex flex-col gap-2">
        {(gifts.data ?? []).map((gift) => (
          <button
            key={gift.id}
            type="button"
            onClick={() => setSelected(gift.id)}
            aria-pressed={selected === gift.id}
            disabled={gift.outOfStock}
            className="flex items-center justify-between rounded-lg border px-4 py-4 text-left disabled:opacity-60"
            style={{
              minHeight: 64,
              borderColor: selected === gift.id ? 'var(--color-primary)' : 'var(--line)',
              background: selected === gift.id ? 'var(--surface-alt)' : 'var(--surface)',
            }}
          >
            <span className="font-semibold">{gift.name}</span>
            {/* Stock state is words, not a colour (BUILD_PLAN §9.7). */}
            <span
              className="text-sm font-semibold"
              style={{
                color: gift.outOfStock
                  ? 'var(--color-alert)'
                  : gift.lowStock
                    ? 'var(--color-warn)'
                    : 'var(--text-muted)',
              }}
            >
              {gift.outOfStock
                ? 'Out of stock'
                : gift.lowStock
                  ? `Low — ${gift.remaining} left`
                  : `${gift.remaining} left`}
            </span>
          </button>
        ))}
      </div>

      {selected ? (
        <>
          <h2 className="mb-2 font-semibold">Scan the card, or hand it over without one</h2>
          <CardCodeInput
            videoRef={scanner.videoRef}
            scannerState={scanner.state}
            onSubmitCode={(code) => void redeem(code)}
            pending={pending}
          />

          <button
            type="button"
            className="pill-quiet mt-4 w-full"
            style={{ minHeight: 56 }}
            disabled={pending}
            onClick={() => void redeem()}
          >
            Redeem without a card code
          </button>
        </>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>Pick a gift to continue.</p>
      )}

      {message ? (
        <p
          role="status"
          className="mt-4 rounded-lg px-4 py-3 font-semibold"
          style={{
            background:
              message.tone === 'ok'
                ? 'var(--color-ok-surface)'
                : message.tone === 'warn'
                  ? 'var(--color-warn-surface)'
                  : 'var(--color-alert-surface)',
            color:
              message.tone === 'ok'
                ? 'var(--color-ok)'
                : message.tone === 'warn'
                  ? 'var(--color-warn)'
                  : 'var(--color-alert)',
          }}
        >
          {message.text}
        </p>
      ) : null}
    </AppShell>
  );
}
