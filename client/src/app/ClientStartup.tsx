'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { loadClientConfiguration } from '@/shared/lib/env';
import { Button } from '@/shared/ui';

/** No session, navigation, capture or push consumer mounts before configuration succeeds. */
export function ClientStartup({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<'loading' | 'failed' | 'ready'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void loadClientConfiguration().then(
      () => {
        if (active) setStatus('ready');
      },
      () => {
        if (active) setStatus('failed');
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  if (status === 'ready') return children;
  return (
    <main className="mx-auto flex min-h-dvh max-w-form flex-col justify-center gap-md px-md py-xl">
      {status === 'failed' ? (
        <>
          <h1 className="text-display">Unable to start</h1>
          <p role="alert">
            Check your connection and try again. If the problem continues, contact your coordinator.
          </p>
          <Button
            onClick={() => {
              setStatus('loading');
              setAttempt((value) => value + 1);
            }}
            size="lg"
          >
            Try again
          </Button>
        </>
      ) : (
        <p role="status" aria-live="polite">
          Loading application…
        </p>
      )}
    </main>
  );
}
