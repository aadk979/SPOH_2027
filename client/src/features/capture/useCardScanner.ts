import { useCallback } from 'react';
import { useQrScanner } from './useQrScanner';
import { readScan } from './model/readScan';
import { resolveScannedCard } from './api';
import { useEventId } from '@/shared/lib/eventContext';

/**
 * The camera, reading Mission Cards. A bare code acts at once; a printed QR's
 * payload is resolved to its card first (F03-045). When that fails, offline or
 * unknown, `onUnresolved` asks for the code printed under the QR instead.
 */
export function useCardScanner(onCode: (code: string) => Promise<void>, onUnresolved: () => void) {
  const eventId = useEventId();
  const onDecode = useCallback(
    (text: string): void => {
      const scan = readScan(text);
      if (!scan) return;
      if (scan.kind === 'code') {
        void onCode(scan.code);
        return;
      }
      resolveScannedCard(eventId, scan.payload).then(
        (card) => void onCode(card.shortCode),
        () => onUnresolved(),
      );
    },
    [eventId, onCode, onUnresolved],
  );
  return useQrScanner({ onDecode });
}
