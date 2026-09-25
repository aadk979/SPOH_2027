'use client';

import { useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import type { ScannerState } from '@/features/capture/useQrScanner';
import { Button, Input } from './ui';

/**
 * Scan-or-type, side by side (BUILD_PLAN §9.4).
 *
 * Manual entry is always visible, never behind a toggle. A damaged QR is a
 * named case in the brief, and a facilitator who has to discover the fallback
 * while a visitor waits will give up and stop scanning altogether.
 */

const SCANNER_MESSAGE: Record<ScannerState, string> = {
  scanning: 'Point the camera at the QR code on the card.',
  starting: 'Starting the camera…',
  denied: 'The camera is not available. Type the six-character code instead.',
  unavailable: 'This device cannot scan. Type the six-character code instead.',
  idle: 'Camera off.',
};

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
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent): void {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError('Card code must be exactly 6 characters.');
      return;
    }
    setError(null);
    onSubmitCode(trimmed);
    setCode('');
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>): void {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text');
    const cleaned = pasted
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6);
    setCode(cleaned);
    if (error) setError(null);
  }

  const isCameraDisabled = scannerState === 'denied' || scannerState === 'unavailable';

  return (
    <div className="flex flex-col gap-sm">
      {/*
        The viewfinder is capped as well as ratioed. At 4:3 unconstrained it
        took the whole of a phone screen and pushed the type-it-instead field
        below the fold, which is exactly the fallback a damaged card needs.
        When camera access is denied or unavailable, the void is hidden.
      */}
      <div
        className={`mx-auto w-full max-w-form overflow-hidden rounded-lg bg-void [aspect-ratio:4/3] ${
          isCameraDisabled ? 'hidden' : ''
        }`}
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

      <p className="text-caption text-text-muted" aria-live="polite">
        {SCANNER_MESSAGE[scannerState]}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-xs">
        <div className="flex gap-xs">
          <label htmlFor="card-code" className="sr-only">
            Six-character card code
          </label>
          <Input
            id="card-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
              if (error) setError(null);
            }}
            onPaste={handlePaste}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="Card code"
            scale="lg"
            // Wide tracking and the display face: this is read back against a
            // printed card character by character, and 0/O and 1/I have to be
            // told apart at arm's length.
            className="flex-1 font-display tracking-[0.25em] uppercase"
            aria-invalid={error ? true : undefined}
          />
          <Button type="submit" size="lg" disabled={code.trim().length !== 6 || pending}>
            Go
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-caption font-semibold text-alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
