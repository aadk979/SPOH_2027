'use client';
import { useEffect, type ReactNode } from 'react';
import { useCaptureCategories } from '@/features/registration';
import { useRequireSession } from '@/features/session';
import { upgradeLegacyEntries } from '@/shared/lib/outbox';
import { ButtonLink, Card, CardTitle, LoadingRows, Stack } from '@/shared/ui';
import { EventProvider } from './EventProvider';
import { useMyEvents } from './queries';

/**
 * Every `/e/<slug>/…` page: signed in, inside one of the caller's events
 * (ADR-001 §5). Also where the outbox learns Event #1's id, so entries the
 * previous build queued move onto its paths (ADR-009 §6).
 */
export function EventLayout({ children }: { children: ReactNode }): ReactNode {
  const session = useRequireSession();
  useLegacyOutboxUpgrade();
  if (!session) return null;
  return (
    <EventProvider fallback={(state) => <EventUnavailable state={state} />}>
      <OfflineWarmup />
      {children}
    </EventProvider>
  );
}

/**
 * Loads, on entering an event, what its capture screens need offline: the
 * booth's categories are the event's data (ADR-002), and a booth first opened
 * in a dead spot must still have its buttons. They are kept on the device.
 */
function OfflineWarmup(): null {
  useCaptureCategories();
  return null;
}

function useLegacyOutboxUpgrade(): void {
  const { data: events } = useMyEvents();
  const legacy = events?.find((event) => event.servesLegacyPaths)?.id;
  useEffect(() => {
    if (legacy) void upgradeLegacyEntries(legacy).catch(() => undefined);
  }, [legacy]);
}

function EventUnavailable({ state }: { state: 'loading' | 'unknown' }): ReactNode {
  if (state === 'loading') {
    return (
      <main className="mx-auto w-full max-w-reading px-md py-lg">
        <LoadingRows />
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-reading px-md py-lg">
      <Stack>
        <Card className="flex flex-col gap-md text-center">
          <CardTitle as="h1">This event is not one of yours</CardTitle>
          <p className="text-body text-text-muted">
            The link may be for an event you are not on the roster for, or one that has been
            archived.
          </p>
          <ButtonLink href="/events" variant="primary">
            Your events
          </ButtonLink>
        </Card>
      </Stack>
    </main>
  );
}
