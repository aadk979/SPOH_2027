'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

export function ConfirmationDialog({ open, title, children, confirmLabel, pending = false, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const origin = document.activeElement;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    cancel.current?.focus();
    return () => {
      if (typeof element.close === 'function') element.close();
      else element.removeAttribute('open');
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={dialog} aria-labelledby={titleId} aria-modal="true"
      className="m-auto max-h-[85dvh] w-[min(90vw,36rem)] overflow-y-auto rounded-lg border border-line bg-surface p-lg text-text backdrop:bg-black/50"
      onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}>
      <h2 id={titleId} className="text-tagline font-semibold">{title}</h2>
      <div className="mt-md">{children}</div>
      <div className="mt-lg flex flex-wrap justify-end gap-sm">
        <button ref={cancel} type="button" className="min-h-control rounded-pill border border-line px-md py-xs" disabled={pending} onClick={onCancel}>Cancel</button>
        <Button disabled={pending} onClick={onConfirm}>{pending ? 'Confirming…' : confirmLabel}</Button>
      </div>
    </dialog>
  );
}
