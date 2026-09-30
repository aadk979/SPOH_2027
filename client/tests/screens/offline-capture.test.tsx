import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import NewIncidentScreen from '@/features/incident/screens/NewIncidentScreen';
import RaiseLostPersonScreen from '@/features/lostPerson/screens/RaiseLostPersonScreen';
import { useStampCapture } from '@/features/cards/hooks/useStampCapture';
import { useRedemption } from '@/features/gifts/hooks/useRedemption';
import { api } from '@/shared/lib/api';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { enqueue } from '@/shared/lib/outbox';
import { TEST_EVENT } from '../helpers/event';

/** The test event's API paths and screen addresses (tests/setup.ts). */
const API = `/events/${TEST_EVENT.id}`;

/** ADR-007 §5 (F03-034): stamps, redemptions and incidents queue offline; alerts never do. */

const state = vi.hoisted(() => ({ replace: vi.fn() }));
const STATION = {
  id: 'station-1',
  name: 'Room A',
  type: { registersVisitors: false, countsEntry: false, issuesStamp: false, redeemsGifts: true },
};
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/features/session', () => ({
  useRequireSession: () => ({ accessToken: 'fixture' }),
  useCurrentSession: () => ({ accessToken: 'fixture' }),
  useMe: () => ({ data: { capabilities: [], currentAssignment: { station: STATION } } }),
}));
vi.mock('@/features/capture', () => ({ useCardScanner: () => ({ state: 'denied' }) }));
vi.mock('@/features/media', () => ({ usePhotoUpload: () => ({ available: false, key: null }) }));
vi.mock('@/shared/lib/outbox', () => ({ enqueue: vi.fn() }));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const mockedEnqueue = vi.mocked(enqueue);
const clients: QueryClient[] = [];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const offline = () => new NetworkError(new TypeError('fetch failed'));

beforeEach(() => {
  mockedApi.mockReset();
  mockedEnqueue.mockReset();
  mockedEnqueue.mockResolvedValue({} as Awaited<ReturnType<typeof enqueue>>);
  state.replace.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('stamps', () => {
  it('queue with the key they were sent with when the network fails', async () => {
    mockedApi.mockRejectedValue(offline());
    const { result } = renderHook(() => useStampCapture(), { wrapper });
    await act(() => result.current.stamp('ABC123'));

    const sent = mockedApi.mock.calls[0]![1] as { body: { idempotencyKey: string } };
    expect(mockedEnqueue).toHaveBeenCalledWith({
      idempotencyKey: sent.body.idempotencyKey,
      eventId: TEST_EVENT.id,
      path: '/cards/ABC123/stamps',
      body: sent.body,
    });
    expect(result.current.message?.tone).toBe('warn');
    expect(result.current.message?.text).toMatch(/saved on this phone/);
  });

  it('are not queued when the server refused them', async () => {
    mockedApi.mockRejectedValue(
      new ApiError(404, { code: 'NOT_FOUND', message: 'Card not found', requestId: 'r' }),
    );
    const { result } = renderHook(() => useStampCapture(), { wrapper });
    await act(() => result.current.stamp('ABC123'));
    expect(mockedEnqueue).not.toHaveBeenCalled();
    expect(result.current.message).toEqual({ tone: 'alert', text: 'Card not found' });
  });
});

describe('redemptions', () => {
  it('queue marked as handed over, so a broken rule is flagged on sync', async () => {
    mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (options?.method) throw offline();
      return path === `${API}/gifts` ? { data: [] } : {};
    });
    const { result } = renderHook(() => useRedemption(true), { wrapper });
    act(() => result.current.setSelected('gift-1'));
    await act(() => result.current.redeem('ABC123'));

    const call = mockedApi.mock.calls.find(([, options]) => options?.method);
    const sent = call![1] as { body: { idempotencyKey: string } };
    expect(mockedEnqueue).toHaveBeenCalledWith({
      idempotencyKey: sent.body.idempotencyKey,
      eventId: TEST_EVENT.id,
      path: '/gifts/redemptions',
      body: { ...sent.body, queued: true },
    });
    expect(result.current.message?.text).toMatch(/Hand over the gift/);
  });
});

describe('incident reports', () => {
  it('queue offline and tell the reporter to find their IC now', async () => {
    mockedApi.mockRejectedValue(offline());
    render(<NewIncidentScreen />, { wrapper });
    const description = screen.getByLabelText('What happened?');
    fireEvent.change(description, { target: { value: 'Cable across the walkway' } });
    fireEvent.submit(description.closest('form')!);

    await screen.findByText('Queued. If anyone is hurt or in danger, tell your IC now.');
    const sent = mockedApi.mock.calls[0]![1] as { body: { idempotencyKey: string } };
    expect(mockedEnqueue).toHaveBeenCalledWith({
      idempotencyKey: sent.body.idempotencyKey,
      eventId: TEST_EVENT.id,
      path: '/incidents',
      body: sent.body,
    });
    expect(state.replace).not.toHaveBeenCalled();
  });
});

describe('lost-person alerts', () => {
  it('are never queued: offline, the escalation script and an explicit send now', async () => {
    mockedApi.mockRejectedValue(offline());
    render(<RaiseLostPersonScreen />, { wrapper });
    const description = screen.getByLabelText('What has happened, and who are we looking for?');
    fireEvent.change(description, { target: { value: 'Child in a red shirt' } });
    fireEvent.submit(description.closest('form')!);

    await screen.findByText(/Call your IC on the radio now/);
    expect(mockedEnqueue).not.toHaveBeenCalled();
    expect((description as HTMLTextAreaElement).value).toBe('Child in a red shirt');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send the alert now' }).hasAttribute('disabled'),
      ).toBe(false),
    );
  });
});
