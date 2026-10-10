import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api } from '@/shared/lib/api';
import { TEST_EVENT } from '../helpers/event';
import { useAcknowledgeAlert, useResolveAlert, lostPersonKeys } from '@/features/lostPerson';
import { useStationDashboard } from '@/features/dashboard';
import {
  useVolunteers,
  useUpdateVolunteer,
  useDeactivateVolunteer,
  useReactivateVolunteer,
  volunteerKeys,
} from '@/features/volunteers';

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
  vi.restoreAllMocks();
});

it('does not query a station dashboard until a station is selected', async () => {
  const { wrapper } = setup();
  const { rerender } = renderHook(({ id }: { id: string | undefined }) => useStationDashboard(id), {
    wrapper,
    initialProps: { id: undefined as string | undefined },
  });
  expect(api).not.toHaveBeenCalled();
  rerender({ id: 'station-42' });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(`/events/${TEST_EVENT.id}/dashboard/station/station-42`),
  );
});

it('keeps practice dashboard results out of the default cache', async () => {
  const { wrapper } = setup();
  vi.mocked(api).mockImplementation(async (path) => ({
    rehearsalIncluded: path.includes('includeRehearsal=true'),
  }));
  const { result, rerender } = renderHook(
    ({ included }) => useStationDashboard('station-42', included),
    {
      wrapper,
      initialProps: { included: false },
    },
  );
  await waitFor(() => expect(result.current.data?.rehearsalIncluded).toBe(false));
  rerender({ included: true });
  await waitFor(() => expect(result.current.data?.rehearsalIncluded).toBe(true));
  rerender({ included: false });
  await waitFor(() => expect(result.current.data?.rehearsalIncluded).toBe(false));
});

it('acknowledges an alert and invalidates the active-alert cache', async () => {
  const { client, wrapper } = setup();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync('alert-42');
  });
  expect(api).toHaveBeenCalledWith(`/events/${TEST_EVENT.id}/lost-person/alert-42/ack`, {
    method: 'POST',
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: lostPersonKeys.active(TEST_EVENT.id) });
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
  expect(api).toHaveBeenLastCalledWith(`/events/${TEST_EVENT.id}/lost-person/alert-42/resolve`, {
    method: 'POST',
    body: { outcome: 'RESOLVED_FOUND' },
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: lostPersonKeys.active(TEST_EVENT.id) });
});

it('preserves roster filter encoding and separate list cache entries', async () => {
  const { client, wrapper } = setup();
  const filters = { q: '  Lee & Tan  ', role: 'IC', active: 'false', sort: 'lastSeen' } as const;
  const response = { data: [], meta: { count: 0, nextCursor: null } };
  vi.mocked(api).mockResolvedValue(response);
  renderHook(() => useVolunteers(filters), { wrapper });
  await waitFor(() =>
    expect(client.getQueryData(volunteerKeys.list(TEST_EVENT.id, filters))).toEqual(response),
  );
  expect(api).toHaveBeenCalledWith(
    `/events/${TEST_EVENT.id}/admin/volunteers?q=Lee+%26+Tan&role=IC&active=false&sort=lastSeen&limit=100`,
  );
});

it('invalidates all roster filters only after successful mutations', async () => {
  const updateKey = '70000000-0000-4000-8000-000000000001';
  const deactivateKey = '70000000-0000-4000-8000-000000000002';
  const reactivateKey = '70000000-0000-4000-8000-000000000003';
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce(updateKey)
    .mockReturnValueOnce(deactivateKey)
    .mockReturnValueOnce(reactivateKey);
  const { client, wrapper } = setup();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(
    () => ({
      update: useUpdateVolunteer(),
      deactivate: useDeactivateVolunteer(),
      reactivate: useReactivateVolunteer(),
    }),
    { wrapper },
  );
  vi.mocked(api).mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    await expect(
      result.current.update.mutateAsync({ id: 'person-42', patch: { role: 'IC' } }),
    ).rejects.toThrow('offline');
  });
  expect(invalidate).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.update.mutateAsync({ id: 'person-42', patch: { role: 'IC' } });
    await result.current.deactivate.mutateAsync({
      id: 'person-42',
      body: { reason: 'Left the roster', disableIdentity: false },
    });
    await result.current.reactivate.mutateAsync('person-42');
  });
  for (const attempt of [1, 2])
    expect(api).toHaveBeenNthCalledWith(
      attempt,
      `/events/${TEST_EVENT.id}/admin/volunteers/person-42`,
      { method: 'PATCH', body: { role: 'IC', idempotencyKey: updateKey } },
    );
  expect(api).toHaveBeenCalledWith(
    `/events/${TEST_EVENT.id}/admin/volunteers/person-42/deactivate`,
    {
      method: 'POST',
      body: { reason: 'Left the roster', disableIdentity: false, idempotencyKey: deactivateKey },
    },
  );
  expect(api).toHaveBeenLastCalledWith(
    `/events/${TEST_EVENT.id}/admin/volunteers/person-42/reactivate`,
    {
      method: 'POST',
      body: { idempotencyKey: reactivateKey },
    },
  );
  expect(invalidate).toHaveBeenCalledTimes(3);
  expect(
    invalidate.mock.calls.every(
      ([filter]) =>
        JSON.stringify(filter?.queryKey) === JSON.stringify(volunteerKeys.all(TEST_EVENT.id)),
    ),
  ).toBe(true);
});
