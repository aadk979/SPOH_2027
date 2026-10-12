import type { ReactNode } from 'react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapture } from '@/features/capture/useCapture';
import { GiftStockForm } from '@/features/gifts/components/GiftStockForm';
import { VisitorFieldEditor } from '@/features/visitor/components/VisitorFieldEditor';
import { ConnectionState } from '@/shared/shell/ConnectionState';
import { ToastProvider } from '@/shared/ui';
import { cancel, enqueue } from '@/shared/lib/outbox';
import { api, ApiError } from '@/shared/lib/api';
import { ms } from '@/shared/lib/runtimeSettings';

const state = vi.hoisted(() => ({ person: 'reader-a', online: true, pending: false }));
vi.mock('@/features/session', () => ({ useCurrentSession: () => ({ volunteerId: state.person }), useAllows: () => () => true }));
vi.mock('@/shared/hooks/useOnline', () => ({ useOnline: () => state.online }));
vi.mock('@/shared/shell/SyncIndicator', () => ({ useOutboxEntries: () => state.pending ? [{ status: 'pending' }] : [] }));
vi.mock('@/shared/lib/outbox', () => ({ enqueue: vi.fn(), cancel: vi.fn() }));
vi.mock('@/shared/lib/api', async (original) => ({ ...(await original<typeof import('@/shared/lib/api')>()), api: vi.fn() }));
const gift = { id: 'gift-a', name: 'Synthetic badge', rehearsal: false, initialStock: 20, lowStockThreshold: 5,
  active: true, remaining: 20, redeemed: 0, adjustment: 0, lowStock: false, outOfStock: false };
const field = { id: 'field-a', code: 'contact', label: 'Contact email', type: 'email', classification: 'visitor-personal',
  retentionDays: 7, readers: ['CHIEF_COORDINATOR'], sortOrder: 0, active: true };
let client: QueryClient;
function show(children: ReactNode) { return render(<QueryClientProvider client={client}><ToastProvider ownerKey={state.person}>{children}</ToastProvider></QueryClientProvider>); }
beforeEach(() => {
  state.person = 'reader-a'; state.online = true; state.pending = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(api).mockReset(); vi.mocked(enqueue).mockReset(); vi.mocked(cancel).mockReset();
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });

describe('truthful durable capture undo', () => {
  it.each([true, false])('only lowers the count when atomic cancellation returns %s', async (removed) => {
    vi.mocked(cancel).mockResolvedValue(removed);
    const { result } = renderHook(() => useCapture());
    await act(() => result.current.capture({ endpoint: '/footfall/ticks', body: { stationId: 'station' }, label: 'entry' }));
    expect(result.current.sessionCount).toBe(1);
    expect(result.current.feedback).toBe('Saved on this phone. Waiting to sync.');
    await act(() => result.current.undo());
    expect(result.current.sessionCount).toBe(removed ? 0 : 1);
    expect(result.current.feedback).toBe(removed ? 'Capture removed from this phone.' : 'This capture is sending or already recorded. Ask your IC for a correction.');
    expect(result.current.undoable).toBeNull();
  });
  it('does not cancel after the configured undo deadline, even from a stale rendered control', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCapture());
    await act(() => result.current.capture({ endpoint: '/registrations', body: {}, label: 'Guest' }));
    vi.setSystemTime(Date.now() + ms.undoWindow() + 1);
    await act(() => result.current.undo());
    expect(cancel).not.toHaveBeenCalled();
    expect(result.current.sessionCount).toBe(1);
    expect(result.current.feedback).toContain('undo window ended');
  });
  it('keeps the capture count when local cancellation is not confirmed', async () => {
    vi.mocked(cancel).mockRejectedValue(new Error('synthetic storage failure'));
    const { result } = renderHook(() => useCapture());
    await act(() => result.current.capture({ endpoint: '/registrations', body: {}, label: 'Guest' }));
    await act(() => result.current.undo());
    expect(result.current.sessionCount).toBe(1);
    expect(result.current.error).toContain('Cancellation was not confirmed');
  });
  it('preserves the newer tap and its undo deadline when an older cancellation finishes', async () => {
    vi.useFakeTimers();
    let completeCancellation!: (removed: boolean) => void;
    vi.mocked(cancel).mockImplementation(() => new Promise((resolve) => { completeCancellation = resolve; }));
    const { result } = renderHook(() => useCapture());
    await act(() => result.current.capture({ endpoint: '/footfall/ticks', body: {}, label: 'First' }));
    let undo!: Promise<void>;
    act(() => { undo = result.current.undo(); });
    await act(() => result.current.capture({ endpoint: '/footfall/ticks', body: {}, label: 'Second' }));
    const newerTap = result.current.undoable;
    await act(async () => { completeCancellation(true); await undo; });
    expect(result.current.sessionCount).toBe(1);
    expect(result.current.undoable).toEqual(newerTap);
    expect(result.current.undoable?.label).toBe('Second');
    act(() => vi.advanceTimersByTime(ms.undoWindow()));
    expect(result.current.undoable).toBeNull();
  });
});

it('freezes stock target/pool/delta/reason, cancellation sends nothing, and uncertain retry keeps its receipt', async () => {
  vi.mocked(api).mockRejectedValueOnce(new ApiError(503, { code: 'UNAVAILABLE', message: 'Synthetic', requestId: 'stock-request' })).mockResolvedValue({ giftType: gift });
  show(<GiftStockForm gift={gift} />);
  fireEvent.change(screen.getByLabelText('Stock change'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Reason for stock change'), { target: { value: 'Reviewed delivery' } });
  const origin = screen.getByRole('button', { name: 'Review stock change' });
  origin.focus(); fireEvent.click(origin);
  expect(screen.getByText('Pool: Live')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(document.activeElement).toBe(origin); expect(api).not.toHaveBeenCalled();
  fireEvent.click(origin);
  fireEvent.change(screen.getByLabelText('Stock change'), { target: { value: '99' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record stock change' }));
  await screen.findAllByText('stock-request');
  const first = vi.mocked(api).mock.calls[0]![1]!.body;
  expect(first).toMatchObject({ delta: 5, reason: 'Reviewed delivery', expectedRehearsal: false, idempotencyKey: expect.any(String) });
  fireEvent.click(screen.getByRole('button', { name: 'Record stock change' }));
  await screen.findByText('Stock change recorded in the reviewed pool.');
  expect(vi.mocked(api).mock.calls[1]?.[1]?.body).toEqual(first);
  expect(screen.getByText('Stock change confirmed in the reviewed pool.')).toBeInTheDocument();
});

it('hides stale visitor declarations and form actions after denied refetch, retaining the safe request ID', async () => {
  vi.mocked(api).mockResolvedValue({ data: [field] });
  show(<VisitorFieldEditor enabled canEdit />);
  await screen.findByDisplayValue('Contact email');
  vi.mocked(api).mockRejectedValue(new ApiError(403, { code: 'FORBIDDEN', message: 'Current policy denies declaration access.', requestId: 'visitor-request' }));
  await act(() => client.invalidateQueries({ queryKey: ['evt_test', 'visitor-fields'] }));
  await screen.findByText('visitor-request');
  expect(screen.queryByDisplayValue('Contact email')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save field' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  await waitFor(() => expect(client.getQueriesData({ queryKey: ['evt_test', 'visitor-fields', 'reader-a'] })).toEqual([]));
  expect(vi.mocked(api).mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', signal: expect.any(AbortSignal) });
});

it('distinguishes unavailable live reads from durable queued captures while offline', () => {
  state.online = false;
  const view = render(<ConnectionState />);
  expect(screen.getByText(/Live records and administrative changes need a connection/)).toBeInTheDocument();
  state.pending = true; view.rerender(<ConnectionState />);
  expect(screen.getByText(/Captures saved on this phone will send/)).toBeInTheDocument();
  state.online = true; view.rerender(<ConnectionState />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
