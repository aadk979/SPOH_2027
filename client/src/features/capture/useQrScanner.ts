'use client';

import { BrowserMultiFormatReader } from '@zxing/browser';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Camera QR scanning for Mission Cards (BUILD_PLAN §9.4).
 *
 * Auto-starts, because a facilitator with a queue should not have to press
 * "scan" before scanning. ZXing rather than the native `BarcodeDetector`:
 * volunteers bring their own phones and support for the native API is still
 * absent on much of iOS, so the library that works everywhere is the right one
 * even though it is heavier.
 *
 * The scanner is never the only way in. Manual six-character entry is always
 * visible beside it, not hidden behind a toggle — a damaged QR is a named case
 * in the brief (§4.3), not an edge case.
 */

export type ScannerState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unavailable';

export interface UseQrScannerResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: ScannerState;
  /** Last decoded payload; cleared by `resume`. */
  result: string | null;
  start(): void;
  stop(): void;
  resume(): void;
}

export function useQrScanner(options: { onDecode(text: string): void }): UseQrScannerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop(): void } | null>(null);
  const [state, setState] = useState<ScannerState>('idle');
  const [result, setResult] = useState<string | null>(null);

  // Held in a ref so restarting the scanner does not depend on the caller
  // memoising their handler.
  const onDecodeRef = useRef(options.onDecode);
  onDecodeRef.current = options.onDecode;

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setState('idle');
  }, []);

  const start = useCallback(() => {
    if (controlsRef.current) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return;
    }

    const video = videoRef.current;
    if (!video) {
      // The effect runs before the element is attached on the first render;
      // the caller's next start() picks it up.
      setState('idle');
      return;
    }

    setState('starting');
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromVideoDevice(
        // undefined asks the browser for its default camera, which is the rear
        // camera on a phone — the one pointed at the card.
        undefined,
        video,
        (decoded) => {
          if (!decoded) return;
          const text = decoded.getText();
          setResult(text);
          onDecodeRef.current(text);
        },
      )
      .then((controls) => {
        controlsRef.current = controls;
        setState('scanning');
      })
      .catch(() => {
        // Permission refused, no camera, or an insecure origin. All of them
        // mean the same thing to the volunteer: type the code instead.
        setState('denied');
      });
  }, []);

  const resume = useCallback(() => setResult(null), []);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  return { videoRef, state, result, start, stop, resume };
}
