import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { LifecycleReadinessResponse } from '@spoh/shared';
import { LifecyclePanel } from '@/features/events/components/LifecyclePanel';
import { LifecycleReview } from '@/features/events/components/LifecycleReview';
import { getLifecycleReadiness, transitionLifecycle } from '@/features/events/api';
import { lifecycleKeys } from '@/features/events/queries';
import { lifecycleBlocker } from '@/features/events/model/lifecycleCopy';
import { api } from '@/shared/lib/api';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { TEST_EVENT } from '../helpers/event';

const session = vi.hoisted(() => ({ personId: 'lifecycle-admin' }));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useCurrentSession: () => (session.personId ? { volunteerId: session.personId } : null),
  useEventTime: () => ({ dateTime: (value: string) => `event-clock:${value}` }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const endpoint = `/events/${TEST_EVENT.id}/lifecycle`;
const clients: QueryClient[] = [];
function ready(): LifecycleReadinessResponse {
  return {
    lifecycle: { eventId: TEST_EVENT.id, status: 'READY', version: 4, hasBeenLive: false },
    evaluatedAt: '2027-01-01T00:00:00Z',
    reopenUntil: null,
    transitions: [
      { to: 'DRAFT', allowed: true, requiresReason: false, blockers: [] },
      { to: 'REHEARSAL', allowed: true, requiresReason: false, blockers: [] },
      {
        to: 'LIVE',
        allowed: false,
        requiresReason: false,
        blockers: ['go-live-checklist-unavailable'],
      },
    ],
  };
}
let current: LifecycleReadinessResponse;
let failure: unknown;
function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    client,
    ...render(node, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
const writes = () => mockedApi.mock.calls.filter(([, options]) => options?.method);
const confirm = () =>
  fireEvent.click(screen.getByLabelText('I have reviewed this transition and its effects'));
beforeEach(() => {
  current = ready();
  failure = undefined;
  session.personId = 'lifecycle-admin';
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (_path, options) => {
    if (failure) throw failure;
    if (options?.method)
      return { lifecycle: { ...current.lifecycle, status: 'REHEARSAL', version: 5 } };
    return current;
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('reviewed lifecycle controls', () => {
  it('keeps readiness collapsed without an API call until requested', async () => {
    show(<LifecyclePanel enabled />);
    expect(mockedApi).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Lifecycle and readiness' }));
    await screen.findByText(/Reviewed state: Ready/);
    expect(mockedApi).toHaveBeenCalledWith(`${endpoint}/readiness`);
    expect(writes()).toHaveLength(0);
  });
  it('shows unavailable server evidence and prevents first go-live and archive actions', () => {
    show(<LifecycleReview readiness={current} />);
    expect(screen.getByText('The go-live checklist is not available yet.')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Go live' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Go live' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive event' })).toBeNull();
  });
  it('requires deliberate confirmation and submits only the exact reviewed version and validated reason', async () => {
    show(<LifecycleReview readiness={current} />);
    fireEvent.change(screen.getByLabelText('Next event state'), { target: { value: 'REHEARSAL' } });
    const submit = screen.getByRole('button', { name: 'Start rehearsal' });
    expect(submit).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText(/Reason for transition/), {
      target: { value: '  Reviewed practice setup  ' },
    });
    confirm();
    fireEvent.click(submit);
    await screen.findByRole('status');
    expect(writes()).toEqual([
      [
        endpoint,
        {
          method: 'POST',
          body: {
            to: 'REHEARSAL',
            expectedVersion: 4,
            reason: 'Reviewed practice setup',
            idempotencyKey: expect.any(String),
          },
        },
      ],
    ]);
    expect(screen.getByRole('button', { name: 'Start rehearsal' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('resets confirmation when the chosen effects change', () => {
    show(<LifecycleReview readiness={current} />);
    confirm();
    fireEvent.change(screen.getByLabelText('Next event state'), { target: { value: 'REHEARSAL' } });
    expect(screen.getByRole('button', { name: 'Start rehearsal' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(writes()).toHaveLength(0);
  });
  it('retains the reviewed version and local reason after background state changes until explicit review', async () => {
    const view = show(<LifecycleReview readiness={current} />);
    fireEvent.change(screen.getByLabelText(/Reason for transition/), {
      target: { value: 'Local review' },
    });
    confirm();
    const next = { ...current, lifecycle: { ...current.lifecycle, version: 5 } };
    view.rerender(<LifecycleReview readiness={next} />);
    expect(screen.getByText(/Reviewed state: Ready · version 4/)).toBeTruthy();
    expect(screen.getByLabelText(/Reason for transition/)).toHaveProperty('value', 'Local review');
    expect(
      screen.getByRole('button', { name: 'Return to draft' }).closest('fieldset'),
    ).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Review current state' }));
    expect(await screen.findByText(/Reviewed state: Ready · version 5/)).toBeTruthy();
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]![1]!.body).toMatchObject({ expectedVersion: 5 });
  });
  it('requires fresh review when current readiness changes without a version change', () => {
    const view = show(<LifecycleReview readiness={current} />);
    const next = {
      ...current,
      transitions: [{ ...current.transitions[0]!, allowed: false, blockers: ['already-live'] }],
    };
    view.rerender(<LifecycleReview readiness={next} />);
    expect(screen.getByRole('alert').textContent).toContain('The event changed after your review.');
    expect(screen.getByRole('button', { name: 'Return to draft' })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('requires a written reopening reason and formats the server deadline on the event clock', async () => {
    const closed: LifecycleReadinessResponse = {
      ...current,
      lifecycle: { ...current.lifecycle, status: 'CLOSED', hasBeenLive: true },
      reopenUntil: '2027-01-03T00:00:00Z',
      transitions: [
        { to: 'LIVE', allowed: true, requiresReason: true, blockers: [] },
        {
          to: 'ARCHIVED',
          allowed: false,
          requiresReason: false,
          blockers: ['archive-unavailable'],
        },
      ],
    };
    show(<LifecycleReview readiness={closed} />);
    expect(screen.getByText(/Reopening deadline: event-clock:2027-01-03/)).toBeTruthy();
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen event' }));
    await screen.findByText('Enter a reason for reopening.');
    expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Reason for transition'), {
      target: { value: 'Correct mistaken closure' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen event' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]![1]!.body).toMatchObject({
      to: 'LIVE',
      expectedVersion: 4,
      reason: 'Correct mistaken closure',
    });
  });
  it('explains close-out effects before sending the close request', () => {
    show(
      <LifecycleReview
        readiness={{
          ...current,
          lifecycle: { ...current.lifecycle, status: 'LIVE' },
          transitions: [{ to: 'CLOSED', allowed: true, requiresReason: false, blockers: [] }],
        }}
      />,
    );
    expect(screen.getByText(/Closing freezes the final report/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close event' })).toHaveProperty('disabled', true);
  });
  it('reuses the exact request after a lost response and changes the UUID for edited intent', async () => {
    failure = new NetworkError('synthetic outage');
    show(<LifecycleReview readiness={current} />);
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));
    await screen.findByRole('alert');
    const first = writes()[0]![1]!.body;
    fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]![1]!.body).toEqual(first);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Return to draft' })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    fireEvent.change(screen.getByLabelText(/Reason for transition/), {
      target: { value: 'Revised reason' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));
    await waitFor(() => expect(writes()).toHaveLength(3));
    expect(writes()[2]![1]!.body).not.toEqual(first);
  });
  it('shows a bounded conflict message without blindly advancing the reviewed version', async () => {
    failure = new ApiError(409, {
      code: 'CONFLICT',
      message: 'private server detail',
      requestId: 'fixture',
    });
    show(<LifecycleReview readiness={current} />);
    confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));
    await screen.findByText(
      'Readiness or the event state changed. Reload readiness and review the transition again.',
    );
    expect(screen.queryByText('private server detail')).toBeNull();
    expect(screen.getByText(/Reviewed state: Ready · version 4/)).toBeTruthy();
  });
  it.each([401, 403, 404])(
    'hides controls after a mutation loses access with %s',
    async (status) => {
      failure = new ApiError(status, {
        code: 'FORBIDDEN',
        message: 'fixture detail',
        requestId: 'fixture',
      });
      show(<LifecycleReview readiness={current} />);
      confirm();
      fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));
      await screen.findByRole('alert');
      expect(screen.queryByLabelText('Next event state')).toBeNull();
      expect(screen.queryByText(/Reviewed state:/)).toBeNull();
    },
  );
  it('hides cached readiness when a refetch is denied', async () => {
    show(<LifecyclePanel enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Lifecycle and readiness' }));
    await screen.findByText(/Reviewed state:/);
    failure = new ApiError(403, { code: 'FORBIDDEN', message: 'fixture', requestId: 'fixture' });
    fireEvent.click(screen.getByRole('button', { name: 'Reload readiness' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/Reviewed state:/)).toBeNull();
    expect(screen.queryByLabelText('Next event state')).toBeNull();
  });
  it('removes the workspace immediately on permission loss and isolates accounts in its query key', async () => {
    const view = show(<LifecyclePanel enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Lifecycle and readiness' }));
    await screen.findByText(/Reviewed state:/);
    expect(
      view.client.getQueryData(lifecycleKeys.readiness(TEST_EVENT.id, session.personId)),
    ).toBeDefined();
    expect(lifecycleKeys.readiness(TEST_EVENT.id, 'another-person')).not.toEqual(
      lifecycleKeys.readiness(TEST_EVENT.id, session.personId),
    );
    view.rerender(<LifecyclePanel enabled={false} />);
    expect(screen.queryByText(/Reviewed state:/)).toBeNull();
  });
  it('shows a terminal event without mutation controls', () => {
    show(
      <LifecycleReview
        readiness={{
          ...current,
          lifecycle: { ...current.lifecycle, status: 'ARCHIVED' },
          transitions: [],
        }}
      />,
    );
    expect(screen.queryByLabelText('Next event state')).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it('never displays unknown blocker data as UI or a server error', () => {
    expect(lifecycleBlocker('untrusted private server detail')).toBe(
      'A readiness requirement is not satisfied.',
    );
  });
});

describe('strict lifecycle feature API', () => {
  it('rejects malformed and inconsistent readiness rather than enabling controls', async () => {
    mockedApi.mockResolvedValue({
      ...current,
      transitions: [
        {
          to: 'LIVE',
          allowed: true,
          requiresReason: false,
          blockers: ['go-live-checklist-unavailable'],
        },
      ],
    });
    await expect(getLifecycleReadiness(TEST_EVENT.id)).rejects.toThrow();
    expect(LifecycleReadinessResponse.safeParse({ ...current, extra: 'untrusted' }).success).toBe(
      false,
    );
    expect(
      LifecycleReadinessResponse.safeParse({
        ...current,
        transitions: [current.transitions[0], current.transitions[0]],
      }).success,
    ).toBe(false);
  });
  it('rejects a response from another event', async () => {
    mockedApi.mockResolvedValue({
      ...current,
      lifecycle: { ...current.lifecycle, eventId: 'foreign-event' },
    });
    await expect(getLifecycleReadiness(TEST_EVENT.id)).rejects.toThrow(
      'Unexpected lifecycle event',
    );
  });
  it('validates transition input before any write and validates its response', async () => {
    await expect(
      transitionLifecycle(TEST_EVENT.id, {
        to: 'READY',
        expectedVersion: 0,
        idempotencyKey: 'invalid',
      }),
    ).rejects.toThrow();
    expect(writes()).toHaveLength(0);
    mockedApi.mockResolvedValue({ lifecycle: { ...current.lifecycle, eventId: 'foreign-event' } });
    await expect(
      transitionLifecycle(TEST_EVENT.id, {
        to: 'READY',
        expectedVersion: 0,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow('Unexpected lifecycle event');
  });
});
