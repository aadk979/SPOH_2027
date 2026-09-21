'use client';

import { BrowserQRCodeReader } from '@zxing/browser';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Callout } from '@/components/ui';

export function AttendanceScanner({ onScan }: { onScan(token: string): void }): ReactNode {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onScan);
  callback.current = onScan;
  const [message, setMessage] = useState('Starting camera…');
  const [cameraFailed, setCameraFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let decoded = false;
    let stop: (() => void) | undefined;
    const element = video.current;
    if (!element || !navigator.mediaDevices?.getUserMedia) {
      setMessage('Camera unavailable. Enter your verifier’s secondary PIN below.');
      setCameraFailed(true);
      return;
    }
    const reader = new BrowserQRCodeReader();
    void reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        element,
        (result, _error, controls) => {
          if (cancelled || decoded || !result) return;
          decoded = true;
          controls.stop();
          callback.current(result.getText());
        },
      )
      .then((controls) => {
        stop = () => controls.stop();
        if (cancelled || decoded) controls.stop();
        else {
          setCameraFailed(false);
          setMessage('Point the camera at your admin’s or exco’s attendance QR.');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameraFailed(true);
          setMessage(
            'Camera access failed. Allow camera access or enter your verifier’s secondary PIN below.',
          );
        }
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return (
    <div className="flex flex-col gap-sm">
      <video
        ref={video}
        muted
        playsInline
        className={`mx-auto aspect-square w-full max-w-form rounded-lg bg-void object-cover ${
          cameraFailed ? 'hidden' : ''
        }`}
        aria-label="Attendance QR scanner"
      />
      <Callout tone={cameraFailed ? 'alert' : 'neutral'}>{message}</Callout>
    </div>
  );
}
