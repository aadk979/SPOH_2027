import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { DraftEditor } from '@/features/announcements/components/DraftEditor';
import { DraftSchedules } from '@/features/announcements/components/DraftSchedules';
import { PrivateDraftPanel } from '@/features/announcements/components/PrivateDraftPanel';
import { PublicationScheduleRow } from '@/features/announcements/components/PublicationScheduleRow';
import { ScheduleCreateForm } from '@/features/announcements/components/ScheduleCreateForm';
import { privateAnnouncementKeys } from '@/features/announcements/queries';
import { api } from '@/shared/lib/api';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { DRAFT_ME, PRIVATE_DRAFT, PRIVATE_SCHEDULE } from '../helpers/announcement';
import { TEST_EVENT } from '../helpers/event';

const state = vi.hoisted(() => ({
  personId: 'draft-author-fixture',
  denied: false,
  pending: false,
  draftVersion: 2,
}));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useCurrentSession: () => ({ volunteerId: state.personId }),
  useEventTime: () => ({ dateTime: (value: string) => value }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const API = `/events/${TEST_EVENT.id}/announcements/drafts`;
const clients: QueryClient[] = [];
const page = <T,>(data: T[]) => ({ data, meta: { count: data.length, nextCursor: null } });
function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
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
beforeEach(() => {
  state.personId = PRIVATE_DRAFT.authorId;
  state.denied = false;
  state.pending = false;
  state.draftVersion = 2;
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (options?.method === 'PUT' && state.draftVersion > 2)
      throw new ApiError(409, {
        code: 'CONFLICT',
        message: 'Reload the saved version.',
        requestId: 'fixture',
      });
    if (options?.method)
      return path.includes('/schedules')
        ? { schedule: PRIVATE_SCHEDULE }
        : { draft: PRIVATE_DRAFT };
    if (path.endsWith('/stations')) return page([]);
    if (state.denied)
      throw new ApiError(403, {
        code: 'FORBIDDEN',
        message: 'Permission changed.',
        requestId: 'fixture',
      });
    if (path.includes('/schedules')) return page(state.pending ? [PRIVATE_SCHEDULE] : []);
    return page(
      state.personId === PRIVATE_DRAFT.authorId
        ? [{ ...PRIVATE_DRAFT, version: state.draftVersion }]
        : [],
    );
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('private saved content and reviewed publication', () => {
  it('preserves local input and its reviewed version when another device edits the saved draft', async () => {
    show(<PrivateDraftPanel me={DRAFT_ME} />);
    fireEvent.click(screen.getByRole('button', { name: 'Drafts and scheduled messages' }));
    fireEvent.click(await screen.findByRole('button', { name: /Private synthetic message/ }));
    fireEvent.change(screen.getByLabelText('Draft message'), {
      target: { value: 'Unsaved local input' },
    });
    state.draftVersion = 3;
    fireEvent.click(screen.getByRole('button', { name: 'Reload drafts' }));
    await screen.findByRole('button', { name: 'Load current saved version' });
    await screen.findByRole('heading', { name: 'Schedule saved version 2' });
    expect(screen.getByLabelText('Draft message')).toHaveProperty('value', 'Unsaved local input');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    expect(writes()[0]![1]!.body).toMatchObject({
      body: 'Unsaved local input',
      expectedVersion: 2,
    });
    expect(screen.getByLabelText('Draft message')).toHaveProperty('value', 'Unsaved local input');
    fireEvent.click(screen.getByRole('button', { name: 'Load current saved version' }));
    expect(screen.getByLabelText('Draft message')).toHaveProperty('value', PRIVATE_DRAFT.body);
  });
  it('saves privately through the draft API without publishing immediately', async () => {
    const saved = vi.fn();
    show(<DraftEditor me={DRAFT_ME} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText('Draft message'), {
      target: { value: '  Private synthetic message  ' },
    });
    fireEvent.click(screen.getByLabelText('Address the whole event'));
    fireEvent.click(screen.getByRole('button', { name: 'Save private draft' }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(PRIVATE_DRAFT));
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toEqual([
      API,
      {
        method: 'POST',
        body: {
          body: PRIVATE_DRAFT.body,
          priority: 'INFO',
          target: {},
          requiresAck: false,
          idempotencyKey: expect.any(String),
        },
      },
    ]);
  });
  it('reuses the unchanged creation intent after a lost response', async () => {
    mockedApi.mockImplementation(async (_path, options) => {
      if (options?.method) throw new NetworkError('fixture network loss');
      return page([]);
    });
    show(<DraftEditor me={DRAFT_ME} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Draft message'), {
      target: { value: 'Private retry fixture' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save private draft' }));
    await screen.findByRole('alert');
    const first = writes()[0]![1]!.body;
    fireEvent.click(screen.getByRole('button', { name: 'Save private draft' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]![1]!.body).toEqual(first);
  });
  it('edits the exact saved version and preserves private role restrictions', async () => {
    show(<DraftEditor draft={PRIVATE_DRAFT} me={DRAFT_ME} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Draft message'), {
      target: { value: 'Reviewed update' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual([
      `${API}/${PRIVATE_DRAFT.id}`,
      {
        method: 'PUT',
        body: {
          body: 'Reviewed update',
          priority: 'INFO',
          requiresAck: false,
          target: { role: 'ADMIN' },
          expectedVersion: 2,
        },
      },
    ]);
  });
  it('schedules the saved version on the event clock', async () => {
    show(<ScheduleCreateForm draft={PRIVATE_DRAFT} timezone="Asia/Singapore" />);
    fireEvent.change(screen.getByLabelText('Publish at (Asia/Singapore)'), {
      target: { value: '2027-01-07T09:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule publication' }));
    await screen.findByRole('status');
    expect(writes()[0]).toEqual([
      `${API}/${PRIVATE_DRAFT.id}/schedules`,
      {
        method: 'POST',
        body: {
          expectedVersion: 2,
          runAt: '2027-01-07T01:30:00.000Z',
          idempotencyKey: expect.any(String),
        },
      },
    ]);
  });
  it('keeps exact due seconds when reviewing a pending action and cancels its current version', async () => {
    show(
      <PublicationScheduleRow
        draft={PRIVATE_DRAFT}
        schedule={PRIVATE_SCHEDULE}
        timezone="Asia/Singapore"
        archived={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit publication time' }));
    expect(screen.getByLabelText('New publication time (Asia/Singapore)')).toHaveProperty(
      'value',
      '2027-01-07T09:30',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save publication time' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save publication time' })).toBeNull(),
    );
    expect(writes()[0]![1]).toEqual({
      method: 'PUT',
      body: { expectedVersion: 3, expectedDraftVersion: 2, runAt: PRIVATE_SCHEDULE.runAt },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel publication' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual([
      `${API}/${PRIVATE_DRAFT.id}/schedules/${PRIVATE_SCHEDULE.id}/cancel`,
      { method: 'POST', body: { expectedVersion: 3 } },
    ]);
  });
  it.each(['RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'] as const)(
    'withholds edit/cancel controls for %s',
    (status) => {
      show(
        <PublicationScheduleRow
          draft={PRIVATE_DRAFT}
          schedule={{ ...PRIVATE_SCHEDULE, status }}
          timezone="Asia/Singapore"
          archived={false}
        />,
      );
      expect(screen.queryByRole('button')).toBeNull();
    },
  );
  it('does not offer duplicate publication while one action is active', async () => {
    state.pending = true;
    show(<DraftSchedules draft={PRIVATE_DRAFT} me={DRAFT_ME} />);
    await screen.findByRole('button', { name: 'Cancel publication' });
    expect(screen.queryByRole('button', { name: 'Schedule publication' })).toBeNull();
  });
  it('disables archived draft editing', () => {
    show(
      <DraftEditor
        draft={PRIVATE_DRAFT}
        me={{ ...DRAFT_ME, event: { ...DRAFT_ME.event, status: 'ARCHIVED' } }}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Draft message').closest('fieldset')?.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(writes()).toHaveLength(0);
  });
  it('evicts private cached data on hiding and isolates another account', async () => {
    const view = show(<PrivateDraftPanel key={state.personId} me={DRAFT_ME} />);
    fireEvent.click(screen.getByRole('button', { name: 'Drafts and scheduled messages' }));
    await screen.findByRole('button', { name: /Private synthetic message/ });
    fireEvent.click(screen.getByRole('button', { name: 'Hide drafts and schedules' }));
    await waitFor(() =>
      expect(
        view.client.getQueryData(
          privateAnnouncementKeys.drafts(TEST_EVENT.id, PRIVATE_DRAFT.authorId),
        ),
      ).toBeUndefined(),
    );
    state.personId = 'another-author-fixture';
    view.rerender(<PrivateDraftPanel key={state.personId} me={DRAFT_ME} />);
    fireEvent.click(screen.getByRole('button', { name: 'Drafts and scheduled messages' }));
    await screen.findByText('You have no saved private drafts.');
    expect(screen.queryByText(/Private synthetic message/)).toBeNull();
  });
  it('hides cached private content when permission is revoked on reload', async () => {
    show(<PrivateDraftPanel me={DRAFT_ME} />);
    fireEvent.click(screen.getByRole('button', { name: 'Drafts and scheduled messages' }));
    const selected = await screen.findByRole('button', { name: /Private synthetic message/ });
    fireEvent.click(selected);
    await screen.findByDisplayValue(PRIVATE_DRAFT.body);
    state.denied = true;
    fireEvent.click(screen.getByRole('button', { name: 'Reload drafts' }));
    await screen.findByRole('alert');
    expect(screen.queryByDisplayValue(PRIVATE_DRAFT.body)).toBeNull();
    expect(screen.queryByText(/Private synthetic message/)).toBeNull();
  });
});
