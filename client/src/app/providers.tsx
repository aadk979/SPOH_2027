'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { startOutboxFlushLoop } from '@/lib/outbox';

/**
 * Client providers.
 *
 * Every data view in this app is live and user-scoped, so all fetching happens
 * client-side through TanStack Query (BUILD_PLAN §9.1). Server Components
 * render the shell only.
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
              // Never retry an authorization failure — it will fail the same
              // way every time and just delays the sign-in redirect.
              const status = (error as { status?: number }).status;
              if (status === 401 || status === 403) return false;
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  useEffect(() => startOutboxFlushLoop(), []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
