'use client';

import { useEffect, type ReactNode } from 'react';
import { startOutboxFlushLoop } from '@/shared/lib/outbox';
import { loadClientSettings } from '@/shared/lib/runtimeSettings';
import { bootstrapSession } from '@/shared/lib/session';
import { usePushSubscriptionSync } from '@/features/notification';
import { BrandingRoot } from '@/features/branding';
import { ToastProvider } from '@/shared/ui';
import { useCurrentSession } from '@/features/session';
import { SessionRenewalNotice } from '@/shared/shell/SessionRenewalNotice';

/** Mounted only after ClientStartup accepts the runtime configuration. */
export function RuntimeEffects({ children }: { children: ReactNode }): ReactNode {
  const session = useCurrentSession();
  useEffect(() => {
    void bootstrapSession().then(() => loadClientSettings());
  }, []);
  useEffect(() => startOutboxFlushLoop(), []);
  usePushSubscriptionSync();
  return (
    <ToastProvider ownerKey={`platform:${session?.volunteerId ?? 'signed-out'}`}>
      <BrandingRoot />
      <SessionRenewalNotice />
      {children}
    </ToastProvider>
  );
}
