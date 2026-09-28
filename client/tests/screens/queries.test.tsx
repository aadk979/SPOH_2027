import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api } from '@/shared/lib/api';
import { useAcknowledgeAlert, useResolveAlert, lostPersonKeys } from '@/features/lostPerson';
import { useStationDashboard } from '@/features/dashboard';

vi.mock('@/shared/lib/api', () => ({ api: vi.fn() }));
vi.mock('@/features/session', () => ({ useCurrentSession: () => ({ accessToken: 'test' }) }));
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

it('does not query a station dashboard until a station is selected', async () => {
  const { wrapper } = setup();
  const { rerender } = renderHook(({ id }: { id: string | undefined }) => useStationDashboard(id), {
    wrapper,
    initialProps: { id: undefined as string | undefined },
  });
  expect(api).not.toHaveBeenCalled();
  rerender({ id: 'station-42' });
  await waitFor(() => expect(api).toHaveBeenCalledWith('/dashboard/station/station-42'));
});

it('acknowledges an alert and invalidates the active-alert cache', async () => {
  const { client, wrapper } = setup();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync('alert-42');
  });
  expect(api).toHaveBeenCalledWith('/lost-person/alert-42/ack', { method: 'POST' });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: lostPersonKeys.active });
});

it('sends the resolution outcome and invalidates alerts only after success', async () => {
  const { client, wrapper } = setup();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useResolveAlert(), { wrapper });
  vi.mocked(api).mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    await expect(
      result.current.mutateAsync({ alertId: 'alert-42', outcome: 'RESOLVED_FOUND' }),
    ).rejects.toThrow('offline');
  });
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.mutateAsync({ alertId: 'alert-42', outcome: 'RESOLVED_FOUND' });
  });
  expect(api).toHaveBeenLastCalledWith('/lost-person/alert-42/resolve', {
    method: 'POST',
    body: { outcome: 'RESOLVED_FOUND' },
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: lostPersonKeys.active });
});
