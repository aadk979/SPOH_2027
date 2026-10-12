import type { ReactNode } from 'react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotoUploadStatus } from '@/features/lostFound/components/PhotoUploadStatus';
import { PersonLifecycle } from '@/features/people/components/PersonLifecycle';
import { PersonDataErasure } from '@/features/people/components/PersonDataErasure';
import { ScheduleFormOutcome } from '@/features/schedule/components/ScheduleFormOutcome';
import { useAcknowledgeAlert, useResolveAlert } from '@/features/lostPerson';
import { api, ApiError } from '@/shared/lib/api';
import { ToastProvider } from '@/shared/ui';

vi.mock('@/shared/lib/api', async (original) => ({ ...(await original<typeof import('@/shared/lib/api')>()), api: vi.fn() }));
vi.mock('@/features/session', () => ({ useMe: () => ({ data: { volunteer: { id: 'synthetic-admin' } } }) }));
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  vi.mocked(api).mockReset();
});
afterEach(() => { cleanup(); client.clear(); });
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}><ToastProvider ownerKey="synthetic-reader">{children}</ToastProvider></QueryClientProvider>;
}

it('announces photo progress, a confirmed attachment, failure, and removal in the same polite status', () => {
  const view = render(<PhotoUploadStatus state="idle" />);
  const region = screen.getByRole('status');
  expect(region).toHaveTextContent('No photo attached.');
  expect(region).toHaveAttribute('aria-live', 'polite');
  view.rerender(<PhotoUploadStatus state="uploading" />);
  expect(region).toHaveTextContent('Uploading photo…');
  view.rerender(<PhotoUploadStatus state="error" />);
  expect(region).toHaveTextContent('Photo upload was not confirmed.');
  view.rerender(<PhotoUploadStatus state="done" />);
  expect(region).toHaveTextContent('Photo uploaded and ready to attach.');
  view.rerender(<PhotoUploadStatus state="idle" />);
  expect(region).toHaveTextContent('No photo attached.');
  expect(screen.getByRole('status')).toBe(region);
});

it('announces acknowledgment only after the server confirms it; a failed retry has no success status', async () => {
  let confirm: (value: unknown) => void = () => undefined;
  vi.mocked(api).mockReturnValueOnce(new Promise((resolve) => { confirm = resolve; }));
  const { result } = renderHook(useAcknowledgeAlert, { wrapper });
  let pending: Promise<unknown>;
  act(() => { pending = result.current.mutateAsync('synthetic-alert'); });
  expect(screen.queryByRole('status')).toBeNull();
  await act(async () => { confirm({}); await pending!; });
  expect(screen.getByRole('status')).toHaveTextContent('Lost-person alert acknowledged.');
  expect(screen.getByRole('status')).not.toHaveTextContent('synthetic-alert');
  vi.mocked(api).mockRejectedValueOnce(new ApiError(503, { code: 'UNAVAILABLE', message: 'Synthetic outage', requestId: 'synthetic-request' }));
  await act(async () => { await result.current.mutateAsync('second-alert').catch(() => undefined); });
  expect(screen.getAllByRole('status')).toHaveLength(1);
});

it('retains a minimal clear result outside the disappearing alert banner', async () => {
  vi.mocked(api).mockResolvedValueOnce({});
  const { result } = renderHook(useResolveAlert, { wrapper });
  await act(async () => { await result.current.mutateAsync({ alertId: 'synthetic-alert', outcome: 'RESOLVED_FOUND' }); });
  expect(screen.getByRole('status')).toHaveTextContent('Lost-person alert cleared.');
  expect(screen.getByRole('status')).not.toHaveTextContent('synthetic-alert');
  expect(vi.mocked(api)).toHaveBeenCalledWith('/events/evt_test/lost-person/synthetic-alert/resolve',
    { method: 'POST', body: { outcome: 'RESOLVED_FOUND' } });
});

it('returns focus after cancelling account withdrawal without sending the mutation', () => {
  render(<PersonLifecycle person={{ id: 'other-person', displayName: 'Synthetic Person', email: 'person@example.test', deactivatedAt: null }} />, { wrapper });
  fireEvent.change(screen.getByLabelText('Reason for deactivating'), { target: { value: 'Verified committee departure' } });
  const review = screen.getByRole('button', { name: 'Deactivate across all events' });
  review.focus(); fireEvent.click(review);
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  cancel.focus(); fireEvent.click(cancel);
  expect(screen.getByRole('button', { name: 'Deactivate across all events' })).toHaveFocus();
  expect(vi.mocked(api)).not.toHaveBeenCalled();
});

it('returns focus after cancelling profile erasure while an edited reason keeps keyboard focus', () => {
  render(<PersonDataErasure id="other-person" />, { wrapper });
  const reason = screen.getByLabelText('Erasure reason');
  fireEvent.change(reason, { target: { value: 'Verified synthetic erasure request' } });
  const review = screen.getByRole('button', { name: 'Review profile erasure' });
  review.focus(); fireEvent.click(review);
  const cancel = screen.getByRole('button', { name: 'Cancel' });
  cancel.focus(); fireEvent.click(cancel);
  expect(screen.getByRole('button', { name: 'Review profile erasure' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Review profile erasure' }));
  reason.focus(); fireEvent.change(reason, { target: { value: 'Corrected verification basis' } });
  expect(reason).toHaveFocus();
  expect(vi.mocked(api)).not.toHaveBeenCalled();
});

it('preserves actionable local schedule validation and never presents it as a saved schedule', () => {
  render(<ScheduleFormOutcome invalid="Choose a time after the current observation." error={null} done />);
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a time after the current observation.');
  expect(screen.queryByRole('status')).toBeNull();
});
