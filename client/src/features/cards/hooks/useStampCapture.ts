import { useCallback, useState } from 'react';
import type { MissionCardRecord } from '@spoh/shared';
import type { Tone } from '@/shared/ui';
import { useMe } from '@/features/session';
import { UNRESOLVED_SCAN, useCardScanner } from '@/features/capture';
import { sendOrQueue } from '@/shared/lib/sendOrQueue';
import { useEventId } from '@/shared/lib/eventContext';
import { cardEndpoints, stampCard } from '../api';
import { QUEUED_STAMP, stampFailureMessage, stampMessage } from '../model/stampMessage';
export function useStampCapture() {
  const { data: me } = useMe();
  const eventId = useEventId();
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
        const body = {
          stationId: station.id,
          idempotencyKey: crypto.randomUUID(),
          clientRecordedAt: new Date().toISOString(),
        };
        const outcome = await sendOrQueue({
          eventId,
          path: cardEndpoints.stamps(shortCode),
          body,
          send: () => stampCard(eventId, shortCode, body),
        });
        if (outcome.status === 'queued') {
          setCard(null);
          setMessage(QUEUED_STAMP);
          return;
        }
        const result = outcome.response;

        setCard(result.card);
        navigator.vibrate?.(result.stampAdded ? 15 : [15, 60, 15]);
        if (result.stampAdded) setScanned((count) => count + 1);

        setMessage(stampMessage(result));
      } catch (error) {
        setCard(null);
        setMessage(stampFailureMessage(error));
      } finally {
        setPending(false);
      }
    },
    [eventId, station, pending],
  );

  const onUnresolvedScan = useCallback(() => setMessage(UNRESOLVED_SCAN), []);
  const scanner = useCardScanner(stamp, onUnresolvedScan);
  return { station, card, message, pending, scanned, stamp, scanner };
}
