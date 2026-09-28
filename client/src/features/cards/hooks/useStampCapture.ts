import { useCallback, useState } from 'react';
import type { MissionCardRecord } from '@spoh/shared';
import type { Tone } from '@/shared/ui';
import { useMe } from '@/features/session';
import { useCardScanner } from '@/features/capture';
import { ApiError } from '@/shared/lib/apiErrors';
import { stampCard } from '@/features/cards';
import { stampMessage } from '../model/stampMessage';
export function useStampCapture() {
  const { data: me } = useMe();
  const [card, setCard] = useState<MissionCardRecord | null>(null);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [scanned, setScanned] = useState(0);

  const station = me?.currentAssignment?.station;

  const stamp = useCallback(
    async (shortCode: string): Promise<void> => {
      if (!station || pending) return;
      setPending(true);
      setMessage(null);

      try {
        const result = await stampCard(shortCode, {
          stationId: station.id,
          idempotencyKey: crypto.randomUUID(),
          clientRecordedAt: new Date().toISOString(),
        });

        setCard(result.card);
        navigator.vibrate?.(result.stampAdded ? 15 : [15, 60, 15]);
        if (result.stampAdded) setScanned((count) => count + 1);

        setMessage(stampMessage(result));
      } catch (error) {
        setCard(null);
        setMessage({
          tone: 'alert',
          text:
            error instanceof ApiError
              ? error.message
              : 'Could not reach the server. Stamp the card and carry on.',
        });
      } finally {
        setPending(false);
      }
    },
    [station, pending],
  );

  const scanner = useCardScanner(stamp);
  return { station, card, message, pending, scanned, stamp, scanner };
}
