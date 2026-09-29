'use client';

import type { FormEvent, ReactNode, RefObject } from 'react';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { CardCodeEntry } from '../model/cardCodeEntry';
import type { ScannerState } from '@/features/capture/useQrScanner';
import { CardViewfinder } from './CardViewfinder';
import { Button, Input } from '@/shared/ui';

/**
 * Scan-or-type, side by side (remediation/phases/P07-client-refactor.md).
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
  const form = useZodForm(CardCodeEntry, { code: '' });
  const { code } = form.values;
  const error = form.errors.code;

  /** The printed alphabet's reading rule, from the schema the server applies (F03-020). */
  function submit(event: FormEvent): void {
    event.preventDefault();
    const entry = form.validate();
    if (!entry) return;
    onSubmitCode(entry.code);
    form.reset();
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>): void {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text');
    const cleaned = pasted
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6);
    form.setField('code', cleaned);
  }

  return (
    <div className="flex flex-col gap-sm">
      {/*
        The viewfinder is capped as well as ratioed. At 4:3 unconstrained it
        took the whole of a phone screen and pushed the type-it-instead field
        below the fold, which is exactly the fallback a damaged card needs.
        When camera access is denied or unavailable, the void is hidden.
      */}
      <CardViewfinder videoRef={videoRef} scannerState={scannerState} />
      <form onSubmit={submit} className="flex flex-col gap-xs">
        <div className="flex gap-xs">
          <label htmlFor="card-code" className="sr-only">
            Six-character card code
          </label>
          <Input
            id="card-code"
            value={code}
            onChange={(event) =>
              form.setField('code', event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
            }
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
