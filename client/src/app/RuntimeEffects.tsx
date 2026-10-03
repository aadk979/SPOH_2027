'use client';

import { useEffect, type ReactNode } from 'react';
import { startOutboxFlushLoop } from '@/shared/lib/outbox';
import { loadClientSettings } from '@/shared/lib/runtimeSettings';
import { bootstrapSession } from '@/shared/lib/session';
import { usePushSubscriptionSync } from '@/features/notification';

/** Mounted only after ClientStartup accepts the runtime configuration. */
export function RuntimeEffects({ children }: { children: ReactNode }): ReactNode {
  useEffect(() => {
    void bootstrapSession().then(() => loadClientSettings());
  }, []);
  useEffect(() => startOutboxFlushLoop(), []);
  usePushSubscriptionSync();
  return children;
}
