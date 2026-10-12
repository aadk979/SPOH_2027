'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Button } from './Button';

type Toast = { id: string; text: string };
const ToastContext = createContext<((text: string) => void) | null>(null);

/** Mount with an opaque owner key; a changed owner discards every retained message. */
export function ToastProvider({ ownerKey, children }: { ownerKey: string; children: ReactNode }): ReactNode {
  return <ToastOwner key={ownerKey}>{children}</ToastOwner>;
}

function ToastOwner({ children }: { children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<Toast[]>([]);
  function announce(text: string): void {
    setToasts((current) => [...current.slice(-2), { id: crypto.randomUUID(), text }]);
  }
  return <ToastContext.Provider value={announce}>
    {children}
    <aside aria-label="Action results" className="fixed bottom-lg right-md z-50 flex max-w-[min(90vw,28rem)] flex-col gap-sm">
      {toasts.map((toast) => <div key={toast.id} className="rounded-lg border border-line bg-surface p-md shadow-sm">
        <p role="status" aria-live="polite">{toast.text}</p>
        <Button variant="quiet" size="sm" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>Dismiss</Button>
      </div>)}
    </aside>
  </ToastContext.Provider>;
}

export function useToast(): (text: string) => void {
  const announce = useContext(ToastContext);
  return announce ?? (() => undefined);
}
