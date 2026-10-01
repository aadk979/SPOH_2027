import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { LostFoundRecord, LostPersonAlertRecord } from '@spoh/shared';
import { LostPersonAlert } from '@/features/lostPerson/components/LostPersonAlert';
import { FoundItemCard } from '@/features/lostFound/components/FoundItemCard';
import { useAcknowledgeAlert, useResolveAlert } from '@/features/lostPerson';
import { useClaimLostFound } from '@/features/lostFound';

vi.mock('@/features/session', () => ({
  useEventTime: () => ({ dateTime: (value: string) => value }),
}));
const now = '2027-01-07T02:00:00.000Z';
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

function Alert({ rehearsal }: { rehearsal: boolean }) {
  const alert = LostPersonAlertRecord.parse({
    id: 'alert',
    rehearsal,
    status: 'ACTIVE',
    approxAge: null,
    descriptionText: 'Search description',
    clothingText: null,
    lastSeenStationId: null,
    lastSeenStationName: null,
    lastSeenAt: null,
    raisedById: 'reporter',
    raisedByName: 'Reporter',
    raisedByPhone: null,
    raisedAt: now,
    resolvedAt: null,
    ackCount: 0,
    ackedByMe: false,
  });
  return (
    <LostPersonAlert
      alert={alert}
      acknowledge={useAcknowledgeAlert()}
      resolve={useResolveAlert()}
      canResolve={true}
    />
  );
}
function Item({ rehearsal }: { rehearsal: boolean }) {
  const item = LostFoundRecord.parse({
    id: 'item',
    rehearsal,
    itemLabel: 'Blue bottle',
    categoryLabel: null,
    foundStationId: null,
    foundStationName: null,
    foundAt: now,
    holderNote: null,
    photoKey: null,
    status: 'HELD',
    loggedById: 'reporter',
    loggedByName: 'Reporter',
    claimedAt: null,
    createdAt: now,
  });
  return <FoundItemCard item={item} claim={useClaimLostFound()} />;
}
function show(node: React.ReactNode) {
  const client = new QueryClient();
  clients.push(client);
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

it.each([false, true])(
  'uses the stored alert provenance for its emergency wording (practice %s)',
  (rehearsal) => {
    show(<Alert rehearsal={rehearsal} />);
    expect(
      screen.getByText(
        rehearsal ? 'REHEARSAL · Lost person practice alert' : 'Lost person — search now',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        rehearsal ? 'Lost person — search now' : 'REHEARSAL · Lost person practice alert',
      ),
    ).toBeNull();
  },
);
it.each([false, true])(
  'labels a practice item even when the event is LIVE (practice %s)',
  (rehearsal) => {
    show(<Item rehearsal={rehearsal} />);
    expect(Boolean(screen.queryByText('REHEARSAL · Practice item'))).toBe(rehearsal);
    expect(screen.getByRole('button', { name: 'Mark Blue bottle claimed' })).toBeTruthy();
  },
);
