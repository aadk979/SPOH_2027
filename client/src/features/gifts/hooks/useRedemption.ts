import { useCallback, useState } from 'react';
import type { Tone } from '@/shared/ui';
import { useMe } from '@/features/session';
import { UNRESOLVED_SCAN, useCardScanner } from '@/features/capture';
import { sendOrQueue } from '@/shared/lib/sendOrQueue';
import { useEvent } from '@/shared/lib/eventContext';
import { useGifts } from '../queries';
import { giftEndpoints, redeemGift } from '../api';
import {
  QUEUED_REDEMPTION,
  redemptionFailureMessage,
  redemptionMessage,
} from '../model/redemptionMessage';
export function useRedemption(enabled: boolean) {
  const { data: me } = useMe();
  const { id: eventId, status } = useEvent();
  const rehearsal = status === 'REHEARSAL';
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
        const body = {
          rehearsal,
          giftTypeId: selected,
          stationId: station.id,
          ...(cardShortCode ? { cardShortCode } : {}),
          idempotencyKey: crypto.randomUUID(),
          clientRecordedAt: new Date().toISOString(),
        };
        const outcome = await sendOrQueue({
          eventId,
          path: giftEndpoints.redemptions,
          body,
          // Synced later, the gift was already handed over (ADR-007 §5).
          queuedBody: { ...body, queued: true },
          send: () => redeemGift(eventId, body),
        });
        if (outcome.status === 'queued') {
          setMessage(QUEUED_REDEMPTION);
          return;
        }

        navigator.vibrate?.(15);
        await gifts.refetch();
        setMessage(redemptionMessage(outcome.response));
      } catch (error) {
        setMessage(redemptionFailureMessage(error));
      } finally {
        setPending(false);
      }
    },
    [eventId, rehearsal, station, selected, pending, gifts],
  );

  const onUnresolvedScan = useCallback(() => setMessage(UNRESOLVED_SCAN), []);
  const scanner = useCardScanner(redeem, onUnresolvedScan);
  return { station, selected, setSelected, message, pending, gifts, redeem, scanner };
}
export type Redemption = ReturnType<typeof useRedemption>;
