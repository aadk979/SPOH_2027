'use client';

import { BarcodeFormat, QRCodeWriter } from '@zxing/library';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AttendanceChallenge } from '@spoh/shared';
import { Button, Callout, Card } from '@/components/ui';

export function VerifierCode({
  challenge,
  refresh,
  pending,
}: {
  challenge: AttendanceChallenge;
  refresh(): void;
  pending: boolean;
}): ReactNode {
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

  return (
    <Card>
      {remaining > 0 ? (
        <>
          {challenge.qrEnabled ? (
            <svg
              role="img"
              aria-label="Attendance verification QR code"
              viewBox={`0 0 ${qr.size} ${qr.size}`}
              shapeRendering="crispEdges"
              className="mx-auto w-full max-w-[240px]"
            >
              <rect width={qr.size} height={qr.size} fill="white" />
              <path d={qr.path} fill="black" />
            </svg>
          ) : (
            <Callout>
              Connect this phone to SP Wi-Fi and generate a fresh code to enable QR verification.
              The secondary PIN works on mobile data.
            </Callout>
          )}
          <p className="mt-md text-caption text-text-muted text-center">
            Secondary PIN — share with people present with you
          </p>
          <div className="mt-xs flex flex-col items-center gap-xs">
            <p
              className="whitespace-nowrap font-mono text-title tracking-widest font-semibold"
              aria-label={`Secondary PIN ${challenge.pin}`}
            >
              {challenge.pin}
            </p>
            <Button variant="quiet" size="sm" onClick={handleCopy}>
              {copied ? 'Copied ✓' : 'Copy PIN'}
            </Button>
          </div>
          <p className="mt-xs text-caption text-text-muted text-center">
            Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </p>
        </>
      ) : (
        <Callout tone="alert">This QR and PIN have expired. Generate a fresh code.</Callout>
      )}
      <Button variant="secondary" className="mt-md" onClick={refresh} disabled={pending}>
        {pending ? 'Generating…' : 'Generate fresh QR / PIN'}
      </Button>
      <p className="mt-xs text-caption text-text-muted">
        Generating a new code immediately expires the previous QR and PIN.
      </p>
    </Card>
  );
}
