'use client';

import { useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import type { ScannerState } from '@/features/capture/useQrScanner';

/**
 * Scan-or-type, side by side (BUILD_PLAN §9.4).
 *
 * Manual entry is always visible, never behind a toggle. A damaged QR is a
 * named case in the brief, and a facilitator who has to discover the fallback
 * while a visitor waits will give up and stop scanning altogether.
 */
export function CardCodeInput({
  videoRef,
  scannerState,
  onSubmitCode,
  pending,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  scannerState: ScannerState;
  onSubmitCode(code: string): void;
  pending: boolean;
}): ReactNode {
  const [code, setCode] = useState('');

  function submit(event: FormEvent): void {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) return;
    onSubmitCode(trimmed);
    setCode('');
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="overflow-hidden rounded-lg"
        style={{ background: 'var(--color-void)', aspectRatio: '4 / 3' }}
      >
        {/* muted + playsInline are required for autoplay on iOS. */}
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          muted
          playsInline
          aria-label="Camera viewfinder for scanning a Mission Card"
        />
      </div>

      <p className="text-sm" style={{ color: 'var(--text-muted)' }} aria-live="polite">
        {scannerState === 'scanning'
          ? 'Point the camera at the QR code on the card.'
          : scannerState === 'starting'
            ? 'Starting the camera…'
            : scannerState === 'denied'
              ? 'The camera is not available. Type the six-character code instead.'
              : scannerState === 'unavailable'
                ? 'This device cannot scan. Type the six-character code instead.'
                : 'Camera off.'}
      </p>

      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="card-code" className="sr-only">
          Six-character card code
        </label>
        <input
          id="card-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="Card code"
          className="flex-1 rounded-lg border px-4 py-3 text-2xl uppercase tracking-widest"
          style={{
            borderColor: 'var(--line)',
            background: 'var(--surface)',
            color: 'var(--text)',
            minHeight: 56,
            fontFamily: 'var(--font-display)',
          }}
        />
        <button
          type="submit"
          className="pill"
          style={{ minHeight: 56 }}
          disabled={code.trim().length !== 6 || pending}
        >
          Go
        </button>
      </form>
    </div>
  );
}
