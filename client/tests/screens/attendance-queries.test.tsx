import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AttendanceStatus } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { attendanceKeys, useSubmitAttendance } from '@/features/attendance';
import { sessionKeys } from '@/features/session';

vi.mock('@/shared/lib/api', () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('confirms attendance before refreshing and holds the submission lock until refresh completes', async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const initial: AttendanceStatus = {
    eventDay: null,
    configured: true,
    isRoot: false,
    isExco: false,
    onCampusNetwork: true,
    networkConfigured: true,
    attendance: null,
    canIssue: false,
    serverTime: '2026-09-28T02:00:00Z',
  };
  client.setQueryData(attendanceKeys.status, initial);
  const attendance = {
    id: 'attendance-1',
    presentAt: initial.serverTime,
    method: 'PIN' as const,
    verifiedByName: 'Verifier',
  };
  let release!: () => void;
  const refresh = new Promise<void>((resolve) => {
    release = resolve;
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockReturnValue(refresh);
  const confirmed = vi.fn(() =>
    expect(client.getQueryData<AttendanceStatus>(attendanceKeys.status)?.attendance).toEqual(
      attendance,
    ),
  );
  const settled = vi.fn();
  const { result } = renderHook(
    () => useSubmitAttendance({ onConfirmed: confirmed, onSettled: settled }),
    { wrapper },
  );
  vi.mocked(api).mockResolvedValue({ attendance });
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = result.current.mutateAsync({ method: 'PIN', pin: '1234567890' });
  });
  expect(confirmed).toHaveBeenCalledOnce();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: attendanceKeys.status });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.me });
  expect(settled).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await pending;
  });
  expect(settled).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith('/attendance/submit', {
    method: 'POST',
    body: { method: 'PIN', pin: '1234567890' },
  });
  client.clear();
});

it('releases the submission lock after rejection without changing cached attendance', async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const confirmed = vi.fn();
  const settled = vi.fn();
  const { result } = renderHook(
    () => useSubmitAttendance({ onConfirmed: confirmed, onSettled: settled }),
    { wrapper },
  );
  vi.mocked(api).mockRejectedValue(new Error('Invalid proof'));
  await act(async () => {
    await expect(result.current.mutateAsync({ method: 'PIN', pin: '1234567890' })).rejects.toThrow(
      'Invalid proof',
    );
  });
  expect(confirmed).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expect(settled).toHaveBeenCalledOnce();
  expect(client.getQueryData(attendanceKeys.status)).toBeUndefined();
  client.clear();
});
