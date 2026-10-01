import { cleanup, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MyEvent } from '@spoh/shared';
import { RehearsalBanner } from '@/features/events/components/RehearsalBanner';
import { useEventPhase } from '@/features/events/queries';
import * as eventContext from '@/shared/lib/eventContext';
import { TEST_EVENT } from '../helpers/event';

afterEach(cleanup);

it.each([null, 'DRAFT', 'READY', 'LIVE', 'CLOSED', 'ARCHIVED'] as const)(
  'shows no practice banner for %s',
  (status) => {
    vi.spyOn(eventContext, 'useOptionalEvent').mockReturnValue(
      status ? { ...TEST_EVENT, status } : null,
    );
    render(<RehearsalBanner />);
    expect(screen.queryByRole('note', { name: 'Rehearsal mode' })).toBeNull();
  },
);

it.each([false, true])(
  'labels practice captures, cards, stock and report defaults (display %s)',
  (display) => {
    vi.spyOn(eventContext, 'useOptionalEvent').mockReturnValue({
      ...TEST_EVENT,
      status: 'REHEARSAL',
    });
    render(<RehearsalBanner display={display} />);
    const banner = screen.getByRole('note', { name: 'Rehearsal mode' });
    expect(banner.textContent).toContain('Practice captures, cards and stock');
    expect(banner.textContent).toContain('exclude practice by default');
  },
);

it('invalidates only the changed event so stale practice postings cannot survive go-live', () => {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const key = [TEST_EVENT.id, 'me'];
  const otherKey = ['other-event', 'me'];
  client.setQueryData(key, { currentAssignment: 'practice' });
  client.setQueryData(otherKey, { currentAssignment: 'other' });
  const { rerender, unmount } = renderHook(
    ({ event }: { event: MyEvent }) => useEventPhase(event),
    {
      wrapper,
      initialProps: { event: { ...TEST_EVENT, status: 'REHEARSAL' } },
    },
  );
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  rerender({ event: { ...TEST_EVENT, status: 'LIVE' } });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  unmount();
  client.clear();
});
