import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { Composer } from '@/features/announcements/components/Composer';
import FallbackScreen from '@/features/fallback/screens/FallbackScreen';
import ImportsScreen from '@/features/fallback/screens/ImportsScreen';
import GroupRegistrationScreen from '@/features/registration/screens/GroupRegistrationScreen';
import SignInScreen from '@/features/session/screens/SignInScreen';
import { api } from '@/shared/lib/api';
import { enqueue } from '@/shared/lib/outbox';
import { openSession } from '@/shared/lib/session';
import { TEST_EVENT, TEST_CATEGORIES } from '../helpers/event';
vi.mock('@/features/registration/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/registration/queries')>()),
  useCaptureCategories: () => ({ data: TEST_CATEGORIES }),
}));

/** The test event's API paths and screen addresses (tests/setup.ts). */
const API = `/events/${TEST_EVENT.id}`;

const state = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/features/session', () => ({
  useRequireSession: () => ({ accessToken: 'fixture' }),
  useMe: () => ({ data: { currentAssignment: { station: { id: 'own-station' } } } }),
  hostedSignInUrl: '/hosted',
}));
vi.mock('@/shared/lib/env', async (original) => ({
  ...(await original<typeof import('@/shared/lib/env')>()),
  isDevAuth: true,
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
vi.mock('@/shared/lib/outbox', () => ({ enqueue: vi.fn() }));
vi.mock('@/shared/lib/session', async (original) => ({
  ...(await original<typeof import('@/shared/lib/session')>()),
  openSession: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedEnqueue = vi.mocked(enqueue);
const mockedOpenSession = vi.mocked(openSession);
const clients: QueryClient[] = [];
const STATIONS = [{ id: 'room-a', name: 'Room A' }];

function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function posts(path: string) {
  return mockedApi.mock.calls.filter(([url, options]) => url === path && options?.method);
}

beforeEach(() => {
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method) return { rowsRead: 1, recordsCreated: 1, recordsSkipped: 0, issues: [] };
    return path === `${API}/stations` ? { data: STATIONS } : { data: [] };
  });
  mockedEnqueue.mockReset();
  mockedOpenSession.mockReset();
  state.replace.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('announcement composer', () => {
  const me = {
    capabilities: ['announcement.event.send'],
    currentAssignment: { station: { id: 'own-station', name: 'Booth' } },
  } as unknown as Parameters<typeof Composer>[0]['me'];

  it('sends the validated body to the sender’s station when none is chosen', async () => {
    show(<Composer me={me} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '  Hold at lounge  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(posts(`${API}/announcements`)).toHaveLength(1));
    expect(posts(`${API}/announcements`)[0]![1]).toEqual({
      method: 'POST',
      body: {
        body: 'Hold at lounge',
        priority: 'OPERATIONAL',
        requiresAck: false,
        target: { stationId: 'own-station' },
      },
    });
  });

  it('sends an event-wide message with an empty target', async () => {
    show(<Composer me={me} />);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Doors close at 5' } });
    fireEvent.click(screen.getByLabelText('Send to the whole event'));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(posts(`${API}/announcements`)).toHaveLength(1));
    expect(posts(`${API}/announcements`)[0]![1]?.body).toMatchObject({ target: {} });
  });
});

describe('fallback declaration', () => {
  it('sends a numeric tier and omits the station when event-wide', async () => {
    show(<FallbackScreen />);
    fireEvent.change(screen.getByLabelText('What has happened?'), {
      target: { value: ' Backend down ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Declare Tier 3' }));
    await waitFor(() => expect(posts(`${API}/fallback/windows`)).toHaveLength(1));
    expect(posts(`${API}/fallback/windows`)[0]![1]?.body).toEqual({
      tier: 3,
      reason: 'Backend down',
    });
  });

  it('scopes the window to the chosen station', async () => {
    show(<FallbackScreen />);
    await screen.findByRole('option', { name: 'Room A only' });
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'room-a' } });
    fireEvent.click(screen.getByLabelText(/Tier 4/));
    fireEvent.change(screen.getByLabelText('What has happened?'), {
      target: { value: 'Paper only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Declare Tier 4' }));
    await waitFor(() => expect(posts(`${API}/fallback/windows`)).toHaveLength(1));
    expect(posts(`${API}/fallback/windows`)[0]![1]?.body).toEqual({
      tier: 4,
      reason: 'Paper only',
      stationId: 'room-a',
    });
  });
});

describe('reconciliation import', () => {
  const csv = (count: string) =>
    `category,stationCode,timeBlockStart,count\nSEC_4,BOOTH,2027-01-07T03:30:00.000Z,${count}`;

  it('rejects an invalid row count on the CSV box without calling the server', () => {
    show(<ImportsScreen />);
    const box = screen.getByLabelText('Rows (CSV)');
    fireEvent.change(box, { target: { value: csv('abc') } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview — writes nothing' }));
    return waitFor(() => {
      expect(box.getAttribute('aria-invalid')).toBe('true');
      expect(posts(`${API}/fallback/imports/registrations`)).toHaveLength(0);
    });
  });

  it('previews once corrected, omitting blank optional metadata', async () => {
    show(<ImportsScreen />);
    const box = screen.getByLabelText('Rows (CSV)');
    fireEvent.change(box, { target: { value: csv('0') } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview — writes nothing' }));
    await waitFor(() => expect(box.getAttribute('aria-invalid')).toBe('true'));
    fireEvent.change(box, { target: { value: csv('12') } });
    expect(box.getAttribute('aria-invalid')).toBeNull();
    fireEvent.change(screen.getByLabelText(/File name/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview — writes nothing' }));
    await waitFor(() => expect(posts(`${API}/fallback/imports/registrations`)).toHaveLength(1));
    expect(posts(`${API}/fallback/imports/registrations`)[0]![1]?.body).toEqual({
      source: 'FALLBACK_SHEET',
      commit: false,
      rows: [
        { category: 'SEC_4', stationCode: 'BOOTH', timeBlockStart: expect.any(String), count: 12 },
      ],
    });
  });
});

describe('group registration', () => {
  it('refuses a group over the server’s cap before queueing it', async () => {
    show(<GroupRegistrationScreen />);
    // Each category is within its own limit; only the group total breaks the cap.
    const sec4 = screen.getByRole('button', { name: 'Add one Sec 4' });
    const parent = screen.getByRole('button', { name: 'Add one Parent / Guardian' });
    for (let tap = 0; tap < 11; tap += 1) fireEvent.click(sec4);
    for (let tap = 0; tap < 10; tap += 1) fireEvent.click(parent);
    fireEvent.click(screen.getByRole('button', { name: 'Register 21 people' }));
    await screen.findByText('A group may not exceed 20 people');
    expect(mockedEnqueue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove one Sec 4' }));
    expect(screen.queryByText('A group may not exceed 20 people')).toBeNull();
  });
});

describe('development sign-in', () => {
  it('shows the schema message for a malformed email and retries once corrected', async () => {
    mockedOpenSession.mockResolvedValue({} as Awaited<ReturnType<typeof openSession>>);
    show(<SignInScreen />);
    const email = await screen.findByLabelText('Roster email');
    fireEvent.change(email, { target: { value: 'not-an-email' } });
    fireEvent.submit(email.closest('form')!);
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(mockedOpenSession).not.toHaveBeenCalled();
    fireEvent.change(email, { target: { value: ' Admin@SPOH2027.test ' } });
    fireEvent.submit(email.closest('form')!);
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith('/'));
    expect(mockedOpenSession).toHaveBeenCalledWith({ email: 'admin@spoh2027.test' });
  });
});
