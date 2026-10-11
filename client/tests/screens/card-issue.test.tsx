import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionCardRecord } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { CardIssue } from '@/features/cards/components/CardIssue';

const state = vi.hoisted(() => ({ allowed: true, eventId: 'event-a' }));
vi.mock('@/features/session', () => ({
  useAllows: () => (action: string) => state.allowed && action === 'Registration.Create',
}));
vi.mock('@/shared/lib/eventContext', () => ({ useEventId: () => state.eventId }));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const card: MissionCardRecord = {
  id: 'card',
  shortCode: 'ABC123',
  status: 'UNISSUED',
  rehearsal: false,
  issuedAt: null,
  completedAt: null,
  voidedAt: null,
  reissuedFromId: null,
  batchLabel: 'Morning batch',
  stamps: [],
  remainingStationIds: ['welcome'],
  redeemed: false,
};
const issued = { ...card, status: 'ISSUED' as const, issuedAt: '2027-01-08T01:00:00.000Z' };
const clients: QueryClient[] = [];
function mount(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrap = (child: ReactNode) => (
    <QueryClientProvider client={client}>{child}</QueryClientProvider>
  );
  return { ...render(wrap(node)), client, wrap };
}
beforeEach(() => {
  state.allowed = true;
  state.eventId = 'event-a';
  mockedApi.mockReset();
  mockedApi.mockResolvedValue({ card: issued });
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('physical card issue', () => {
  it('issues only after physical handover confirmation, uses a receipt and returns the saved journey', async () => {
    const onIssued = vi.fn();
    const view = mount(<CardIssue card={card} onIssued={onIssued} />);
    const invalidate = vi.spyOn(view.client, 'invalidateQueries');
    expect(screen.getByText(/only when you hand the physical card to a visitor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Issue this card' }));
    await waitFor(() => expect(onIssued).toHaveBeenCalledExactlyOnceWith(issued));
    expect(window.confirm).toHaveBeenCalledWith('Hand card ABC123 to the visitor?');
    expect(mockedApi).toHaveBeenCalledExactlyOnceWith('/events/event-a/cards/ABC123/issue', {
      method: 'POST',
      body: { idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['event-a'] });
    view.rerender(view.wrap(<CardIssue card={issued} onIssued={onIssued} />));
    expect(screen.queryByRole('button', { name: 'Issue this card' })).toBeNull();
  });
  it('does not create a receipt or send a request when handover is cancelled', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const onIssued = vi.fn();
    mount(<CardIssue card={card} onIssued={onIssued} />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue this card' }));
    expect(mockedApi).not.toHaveBeenCalled();
    expect(onIssued).not.toHaveBeenCalled();
  });
  it('does not offer issue to a reader without the creation grant', () => {
    state.allowed = false;
    mount(<CardIssue card={card} onIssued={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Issue this card' })).toBeNull();
    expect(mockedApi).not.toHaveBeenCalled();
  });
  it.each(['ISSUED', 'COMPLETED', 'VOIDED', 'LOST'] as const)(
    'does not offer a new issue for a %s card',
    (status) => {
      mount(<CardIssue card={{ ...card, status }} onIssued={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'Issue this card' })).toBeNull();
      expect(window.confirm).not.toHaveBeenCalled();
      expect(mockedApi).not.toHaveBeenCalled();
    },
  );
  it('retains the exact receipt on a failed transport retry and calls the parent only on confirmation', async () => {
    mockedApi
      .mockRejectedValueOnce(new Error('Issue was not confirmed'))
      .mockResolvedValue({ card: issued });
    const onIssued = vi.fn();
    mount(<CardIssue card={card} onIssued={onIssued} />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue this card' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Issue was not confirmed');
    expect(onIssued).not.toHaveBeenCalled();
    const firstBody = mockedApi.mock.calls[0]![1]!.body;
    fireEvent.click(screen.getByRole('button', { name: 'Issue this card' }));
    await waitFor(() => expect(onIssued).toHaveBeenCalledExactlyOnceWith(issued));
    expect(mockedApi.mock.calls[1]![1]!.body).toEqual(firstBody);
  });
  it('disables handover while a request is pending so a double tap sends one issue', async () => {
    let finish: (value: unknown) => void = () => {};
    mockedApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onIssued = vi.fn();
    mount(<CardIssue card={card} onIssued={onIssued} />);
    const button = screen.getByRole('button', { name: 'Issue this card' });
    fireEvent.click(button);
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(true));
    fireEvent.click(button);
    expect(mockedApi).toHaveBeenCalledTimes(1);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(onIssued).not.toHaveBeenCalled();
    finish({ card: issued });
    await waitFor(() => expect(onIssued).toHaveBeenCalledExactlyOnceWith(issued));
  });
  it('uses a new receipt and escaped path for a different card after a failed attempt', async () => {
    mockedApi.mockRejectedValueOnce(new Error('Try later')).mockResolvedValue({ card: issued });
    const onIssued = vi.fn();
    const view = mount(<CardIssue card={card} onIssued={onIssued} />);
    fireEvent.click(screen.getByRole('button', { name: 'Issue this card' }));
    await screen.findByRole('alert');
    const firstBody = mockedApi.mock.calls[0]![1]!.body;
    view.rerender(
      view.wrap(<CardIssue card={{ ...card, shortCode: 'ABC 124' }} onIssued={onIssued} />),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Issue this card' }));
    await waitFor(() => expect(onIssued).toHaveBeenCalled());
    expect(mockedApi.mock.calls[1]![0]).toBe('/events/event-a/cards/ABC%20124/issue');
    expect(mockedApi.mock.calls[1]![1]!.body).not.toEqual(firstBody);
  });
});
