import { useRef } from 'react';

/** A failed retry keeps its receipt; a successful new action gets a new receipt. */
export function useRetryKey() {
  const pending = useRef<{ input: string; key: string } | null>(null);
  function forInput(input: unknown): string {
    const serialized = JSON.stringify(input);
    if (pending.current?.input !== serialized)
      pending.current = { input: serialized, key: crypto.randomUUID() };
    return pending.current.key;
  }
  function clear(): void {
    pending.current = null;
  }
  return { forInput, clear };
}
