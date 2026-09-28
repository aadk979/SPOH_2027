import { useCallback, useState } from 'react';
import type { Tone } from '@/shared/ui';
import { useMe } from '@/features/session';
import { useCardScanner } from '@/features/capture';
import { ApiError } from '@/shared/lib/apiErrors';
import { useGifts, redeemGift } from '@/features/gifts';
export function useRedemption(enabled: boolean) {
  const { data: me } = useMe();
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const station = me?.currentAssignment?.station;

  const gifts = useGifts(enabled);

  const redeem = useCallback(
    async (cardShortCode?: string): Promise<void> => {
      if (!station || !selected || pending) return;
      setPending(true);
      setMessage(null);

      try {
        const result = await redeemGift({
          giftTypeId: selected,
          stationId: station.id,
          ...(cardShortCode ? { cardShortCode } : {}),
          idempotencyKey: crypto.randomUUID(),
          clientRecordedAt: new Date().toISOString(),
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

  const scanner = useCardScanner(redeem);
  return { station, selected, setSelected, message, pending, gifts, redeem, scanner };
}
export type Redemption = ReturnType<typeof useRedemption>;
