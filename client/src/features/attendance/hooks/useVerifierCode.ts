import { BarcodeFormat, QRCodeWriter } from '@zxing/library';
import { useEffect, useMemo, useState } from 'react';
import type { AttendanceChallenge } from '@spoh/shared';
export function useVerifierCode(challenge: AttendanceChallenge) {
  const [remaining, setRemaining] = useState(300);
  useEffect(() => {
    const deadline =
      Date.now() + Math.max(0, Date.parse(challenge.expiresAt) - Date.parse(challenge.serverTime));
    const tick = () => setRemaining(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const qr = useMemo(() => {
    const matrix = new QRCodeWriter().encode(
      challenge.token,
      BarcodeFormat.QR_CODE,
      0,
      0,
      new Map(),
    );
    const squares: string[] = [];
    for (let y = 0; y < matrix.getHeight(); y++) {
      for (let x = 0; x < matrix.getWidth(); x++) {
        if (matrix.get(x, y)) squares.push(`M${x},${y}h1v1h-1z`);
      }
    }
    return { size: matrix.getWidth(), path: squares.join('') };
  }, [challenge.token]);
  const [copied, setCopied] = useState(false);
  function handleCopy(): void {
    navigator.clipboard
      .writeText(challenge.pin)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined); // The PIN is already visible on screen to read or type by hand.
  }

  return { remaining, qr, copied, handleCopy };
}
