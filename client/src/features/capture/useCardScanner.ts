import { useCallback } from 'react';
import { useQrScanner } from './useQrScanner';
import { decodedCardCode } from './model/decodedCardCode';
export function useCardScanner(onCode: (code: string) => Promise<void>) {
  const onDecode = useCallback(
    (text: string): void => {
      const shortCode = decodedCardCode(text);
      if (shortCode) void onCode(shortCode);
    },
    [onCode],
  );
  return useQrScanner({ onDecode });
}
