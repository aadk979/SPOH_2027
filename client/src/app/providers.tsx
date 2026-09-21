'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { startOutboxFlushLoop } from '@/lib/outbox';
import { loadClientSettings } from '@/lib/runtimeSettings';
import { bootstrapSession } from '@/lib/session';

/**
 * Client providers.
 *
 * Every data view in this app is live and user-scoped, so all fetching happens
 * client-side through TanStack Query (BUILD_PLAN §9.1). Server Components
 * render the shell only.
 *
 * Three things start here, in this order and for this reason:
 *
 *  1. Session recovery, first and awaited by the guards. On a hard refresh the
 *     access token is gone from memory and has to be renewed from the httpOnly
 *     cookie before any page decides whether to redirect to sign-in.
 *
 *  2. Runtime settings, which every poll interval and the undo window read.
 *     Deliberately not awaited — the compiled defaults are correct, and holding
 *     the first paint on a tuning value would be a poor trade.
 *
 *  3. The outbox flush loop, which is what actually sends captures.
 */
export function Providers({ children }: { children: ReactNode }): ReactNode {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Event data goes stale fast and the screens are glanced at, not
            // studied. Refetching on focus is what makes a dashboard someone
            // walked away from correct when they walk back.
            staleTime: 2_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              // Never retry an authorization failure — `api()` already renews
              // an expired token once and retries transparently, so a 401 that
              // reaches here means the session is genuinely over.
              const status = (error as { status?: number }).status;
              if (status === 401 || status === 403) return false;
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  useEffect(() => {
    void bootstrapSession().then(() => loadClientSettings());
  }, []);

  useEffect(() => startOutboxFlushLoop(), []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
