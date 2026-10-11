import type { ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/shared/lib/api';
import StaffingScreen from '@/features/staffing/screens/StaffingScreen';
import AuditScreen from '@/features/audit/screens/AuditScreen';
import IncidentsScreen from '@/features/incident/screens/IncidentsScreen';
import { STAFFING_PERSON } from '../helpers/staffing';
import { TEST_EVENT } from '../helpers/event';

const state = vi.hoisted(() => ({
  personId: 'organiser',
  eventId: 'evt_test',
  actions: [] as string[],
}));
vi.mock('@/features/session', () => ({
  useRequireSession: () => ({ volunteerId: state.personId }),
  useCurrentSession: () => ({ volunteerId: state.personId }),
  useAllows: () => (action: string) => state.actions.includes(action),
  useEventTime: () => ({ dateTime: (value: string) => value }),
}));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => state.eventId,
  useEvent: () => ({ ...TEST_EVENT, id: state.eventId }),
}));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockApi = vi.mocked(api);
const at = '2027-01-07T01:00:00.000Z';
const page = (row: unknown) => ({ data: [row], meta: { count: 1, nextCursor: null } });
const cases = [
  {
    name: 'staffing',
    action: 'People.Read',
    View: StaffingScreen,
    body: (secret: string) => page({ ...STAFFING_PERSON, displayName: secret }),
  },
  {
    name: 'audit',
    action: 'Audit.Read',
    View: AuditScreen,
    body: (secret: string) =>
      page({
        id: 'audit',
        action: secret,
        entityType: 'Registration',
        entityId: 'reg',
        actorId: 'organiser',
        actorName: 'Organiser',
        before: null,
        after: null,
        requestId: null,
        createdAt: at,
      }),
  },
  {
    name: 'incidents',
    action: 'Incident.Read',
    View: IncidentsScreen,
    body: (secret: string) =>
      page({
        id: 'incident',
        rehearsal: false,
        type: 'NEAR_MISS',
        severity: 'LOW',
        status: 'OPEN',
        stationId: null,
        stationName: null,
        locationNote: null,
        description: secret,
        reportedById: 'organiser',
        reportedByName: 'Organiser',
        occurredAt: at,
        reportedAt: at,
        followUps: [],
      }),
  },
];
const clients: QueryClient[] = [];
function show(View: typeof StaffingScreen) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const tree = () => (
    <QueryClientProvider client={client}>
      <View />
    </QueryClientProvider>
  );
  return { client, tree, view: render(tree()) };
}
beforeEach(() => {
  state.personId = 'organiser';
  state.eventId = 'evt_test';
  state.actions = ['People.Read', 'People.Update', 'Audit.Read', 'Incident.Read'];
  mockApi.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe.each(cases)('$name private readers', ({ name, action, View, body }) => {
  it('hides previously loaded private rows when a refresh fails', async () => {
    mockApi.mockResolvedValue(body('Private original'));
    const { client, view } = show(View);
    await waitFor(() => expect(view.container.textContent).toContain('Private original'));
    mockApi.mockRejectedValue(new Error('Read unavailable'));
    await act(() => client.invalidateQueries({ queryKey: [state.eventId, name] }));
    await screen.findByText('Read unavailable');
    expect(view.container.textContent).not.toContain('Private original');
  });

  it.each([401, 403])('purges private rows after a %i response', async (status) => {
    mockApi.mockResolvedValue(body('Private original'));
    const { client, view } = show(View);
    await waitFor(() => expect(view.container.textContent).toContain('Private original'));
    mockApi.mockRejectedValue(
      new ApiError(status, {
        code: 'FORBIDDEN',
        message: 'Permission changed',
        requestId: 'private-read-denied',
      }),
    );
    await act(() => client.invalidateQueries({ queryKey: [state.eventId, name] }));
    await waitFor(() => expect(view.container.textContent).not.toContain('Private original'));
    await waitFor(() =>
      expect(client.getQueriesData({ queryKey: [state.eventId, name] })).toEqual([]),
    );
    const attempts = mockApi.mock.calls.length;
    view.rerender(
      <QueryClientProvider client={client}>
        <View />
      </QueryClientProvider>,
    );
    await act(() => client.invalidateQueries({ queryKey: [state.eventId, name] }));
    expect(mockApi).toHaveBeenCalledTimes(attempts);
    expect(view.container.textContent).not.toContain('Private original');
  });

  it('unmounts private content when its read permission disappears', async () => {
    mockApi.mockResolvedValue(body('Private original'));
    const { client, view, tree } = show(View);
    await waitFor(() => expect(view.container.textContent).toContain('Private original'));
    state.actions = state.actions.filter((value) => value !== action);
    view.rerender(tree());
    expect(view.container.textContent).not.toContain('Private original');
    await waitFor(() =>
      expect(client.getQueriesData({ queryKey: [state.eventId, name] })).toEqual([]),
    );
  });

  it.each(['person', 'event'])(
    'cancels a prior %s reader and discards its late refresh',
    async (owner) => {
      mockApi.mockResolvedValue(body('Private original'));
      const { client, view, tree } = show(View);
      await waitFor(() => expect(view.container.textContent).toContain('Private original'));
      let resolve!: (value: unknown) => void;
      mockApi.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      let pending!: Promise<void>;
      act(() => {
        pending = client.invalidateQueries({ queryKey: [state.eventId, name] });
      });
      const oldSignal = mockApi.mock.calls.at(-1)?.[1]?.signal;
      expect(oldSignal).toBeInstanceOf(AbortSignal);
      mockApi.mockResolvedValue(body('New owner data'));
      if (owner === 'person') state.personId = 'other-person';
      else state.eventId = 'evt_other';
      view.rerender(tree());
      expect(view.container.textContent).not.toContain('Private original');
      await waitFor(() => expect(view.container.textContent).toContain('New owner data'));
      expect(oldSignal?.aborted).toBe(true);
      await act(async () => {
        resolve(body('Late private response'));
        await pending;
      });
      expect(view.container.textContent).not.toContain('Late private response');
      expect(
        JSON.stringify(
          client
            .getQueryCache()
            .getAll()
            .map((query) => query.state.data),
        ),
      ).not.toContain('Late private response');
    },
  );
});
