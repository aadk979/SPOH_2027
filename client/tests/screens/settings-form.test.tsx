import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenameEventResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { ApiError } from '@/shared/lib/apiErrors';
import { sessionKeys } from '@/features/session';
import { EventNameField } from '@/features/settings/components/EventNameField';
import { ThresholdsForm } from '@/features/settings/components/ThresholdsForm';
import { TEST_EVENT } from '../helpers/event';

const event = vi.hoisted(() => ({ id: 'evt_test' }));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => event.id,
}));
vi.mock('@/features/session/useSession', async (original) => ({
  ...(await original<typeof import('@/features/session/useSession')>()),
  useCurrentSession: () => ({ accessToken: 'test' }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
/** The event's name as the server has it, per event. */
let names: Record<string, string>;

function me(eventId: string) {
  return {
    volunteer: { id: 'chief', displayName: 'Chief', role: 'CHIEF_COORDINATOR' },
    event: { id: eventId, name: names[eventId], timezone: 'Asia/Singapore', locale: 'en-SG' },
    capabilities: ['config.manage'],
  };
}
function eventOf(path: string): string {
  return /^\/events\/([^/]+)\//.exec(path)?.[1] ?? '';
}
function writes() {
  return mockedApi.mock.calls.filter(([, options]) => options?.method === 'PATCH');
}
function show(canEdit = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    client,
    ...render(<EventNameField canEdit={canEdit} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
const field = () => screen.getByLabelText('Event name') as HTMLInputElement;
const renameButton = () => screen.queryByRole('button', { name: 'Rename event' });
async function loaded(name = names[event.id]) {
  await waitFor(() => expect(field().value).toBe(name));
}

beforeEach(() => {
  event.id = TEST_EVENT.id;
  names = { [TEST_EVENT.id]: 'Test Event' };
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    const eventId = eventOf(path);
    if (options?.method === 'PATCH') {
      const body = options.body as { name: string };
      names[eventId] = body.name;
      return { event: me(eventId).event } as unknown as RenameEventResponse;
    }
    return me(eventId);
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe('event name', () => {
  it("shows the event's own name, and offers a rename only for a real change", async () => {
    show();
    await loaded('Test Event');
    expect(renameButton()).toBeNull();
    fireEvent.change(field(), { target: { value: '  Test Event ' } });
    expect(renameButton()).toBeNull();
    fireEvent.change(field(), { target: { value: 'SPOH 2027' } });
    expect(renameButton()).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it('renames from the name read, then shows the new name everywhere it is read', async () => {
    const { client } = show();
    await loaded();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    fireEvent.change(field(), { target: { value: ' SPOH 2027 ' } });
    fireEvent.click(renameButton()!);
    await screen.findByText('Renamed. Every screen shows the new name.');
    expect(writes()).toEqual([
      [
        `/events/${TEST_EVENT.id}/admin/event-name`,
        { method: 'PATCH', body: { name: 'SPOH 2027', expectedName: 'Test Event' } },
      ],
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.me(TEST_EVENT.id) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['events'] });
    await loaded('SPOH 2027');
    expect(renameButton()).toBeNull();
    // The next rename starts from the new name.
    fireEvent.change(field(), { target: { value: 'SPOH 2028' } });
    fireEvent.click(renameButton()!);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]?.[1]?.body).toEqual({ name: 'SPOH 2028', expectedName: 'SPOH 2027' });
  });

  it.each(['', '   ', 'x', 'x'.repeat(121)])('refuses %j before sending anything', async (name) => {
    show();
    await loaded();
    fireEvent.change(field(), { target: { value: name } });
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Use 2 to 120 characters.')).toBeTruthy();
    expect(renameButton()).toBeNull();
    expect(writes()).toEqual([]);
  });

  it('follows a refresh while untouched, but keeps an edited draft and its read name', async () => {
    const { client } = show();
    await loaded();
    names[TEST_EVENT.id] = 'Renamed elsewhere';
    await act(() => client.invalidateQueries({ queryKey: sessionKeys.me(TEST_EVENT.id) }));
    await loaded('Renamed elsewhere');

    fireEvent.change(field(), { target: { value: 'My draft' } });
    names[TEST_EVENT.id] = 'Renamed again';
    await act(() => client.invalidateQueries({ queryKey: sessionKeys.me(TEST_EVENT.id) }));
    expect(field().value).toBe('My draft');
    mockedApi.mockImplementation(async (path, options) => {
      if (options?.method === 'PATCH')
        throw new ApiError(409, {
          code: 'CONFLICT',
          message:
            'Someone renamed this event since you opened it. Reload to see the current name.',
          requestId: 'req',
        });
      return me(eventOf(path));
    });
    fireEvent.click(renameButton()!);
    await screen.findByText(/Someone renamed this event since you opened it/);
    expect(writes()[0]?.[1]?.body).toEqual({ name: 'My draft', expectedName: 'Renamed elsewhere' });
    expect(field().value).toBe('My draft');
  });

  it('blocks editing and a second rename while one is in flight', async () => {
    let finish!: (value: unknown) => void;
    mockedApi.mockImplementation(async (path, options) =>
      options?.method === 'PATCH'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : me(eventOf(path)),
    );
    show();
    await loaded();
    fireEvent.change(field(), { target: { value: 'SPOH 2027' } });
    fireEvent.click(renameButton()!);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(field().hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Renaming…' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Renaming…' }));
    expect(writes()).toHaveLength(1);
    await act(async () => {
      names[TEST_EVENT.id] = 'SPOH 2027';
      finish({ event: me(TEST_EVENT.id).event });
    });
    await screen.findByText('Renamed. Every screen shows the new name.');
  });

  it('keeps a failed rename retryable', async () => {
    let fails = true;
    mockedApi.mockImplementation(async (path, options) => {
      if (options?.method !== 'PATCH') return me(eventOf(path));
      if (fails) throw new Error('offline');
      names[TEST_EVENT.id] = 'SPOH 2027';
      return { event: me(TEST_EVENT.id).event };
    });
    show();
    await loaded();
    fireEvent.change(field(), { target: { value: 'SPOH 2027' } });
    fireEvent.click(renameButton()!);
    await screen.findByText('Not saved');
    expect(field().value).toBe('SPOH 2027');
    fails = false;
    fireEvent.click(renameButton()!);
    await screen.findByText('Renamed. Every screen shows the new name.');
    expect(writes().map(([, options]) => options?.body)).toEqual([
      { name: 'SPOH 2027', expectedName: 'Test Event' },
      { name: 'SPOH 2027', expectedName: 'Test Event' },
    ]);
  });

  it('starts the next event from its own name, not the previous draft', async () => {
    const { rerender } = show();
    await loaded();
    fireEvent.change(field(), { target: { value: 'First event draft' } });
    names['next-event'] = 'Next event';
    event.id = 'next-event';
    rerender(<EventNameField canEdit />);
    await loaded('Next event');
    expect(renameButton()).toBeNull();
    fireEvent.change(field(), { target: { value: 'Next event renamed' } });
    fireEvent.click(renameButton()!);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual([
      '/events/next-event/admin/event-name',
      { method: 'PATCH', body: { name: 'Next event renamed', expectedName: 'Next event' } },
    ]);
  });

  it('shows a reader the name without a way to change it', async () => {
    show(false);
    await loaded();
    expect(field().hasAttribute('disabled')).toBe(true);
    fireEvent.change(field(), { target: { value: 'SPOH 2027' } });
    expect(renameButton()).toBeNull();
  });
});

describe('former legacy settings', () => {
  it('shows each as a pointer to where it is changed now, never as an editable value', () => {
    render(<ThresholdsForm />);
    expect(screen.queryAllByRole('textbox')).toEqual([]);
    expect(screen.queryAllByRole('spinbutton')).toEqual([]);
    expect(screen.getAllByText(/Settings catalogue above/)).toHaveLength(8);
    expect(screen.getAllByText(/or station scope/)).toHaveLength(2);
    expect(
      screen.getAllByText(
        'Changed under Organisation settings above, by a platform admin, for every event.',
      ),
    ).toHaveLength(4);
    expect(
      screen.getAllByText('Changed under Counts and visitor data above, for this event.'),
    ).toHaveLength(1);
  });
});
