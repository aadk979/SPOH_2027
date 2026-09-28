import { useCallback, useRef, useState } from 'react';
export function useScanResult(onDecode: (text: string) => void) {
  const [result, setResult] = useState<string | null>(null);

  // Held in a ref so restarting the scanner does not depend on the caller
  // memoising their handler.
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const resume = useCallback(() => setResult(null), []);
  const receive = useCallback((text: string) => {
    setResult(text);
    onDecodeRef.current(text);
  }, []);
  return { result, resume, receive };
}
