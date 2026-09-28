'use client';

import { useVerifierCode } from './hooks/useVerifierCode';
import type { ReactNode } from 'react';
import type { AttendanceChallenge } from '@spoh/shared';
import { Button, Callout, Card } from '@/shared/ui';

export function VerifierCode({
  challenge,
  refresh,
  pending,
}: {
  challenge: AttendanceChallenge;
  refresh(): void;
  pending: boolean;
}): ReactNode {
  const { remaining, qr, copied, handleCopy } = useVerifierCode(challenge);

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
