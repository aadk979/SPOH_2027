import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '@/shared/lib/api';
import { CreateEventWizard } from '@/features/events/components/CreateEventWizard';
import { CloneEventWizard } from '@/features/events/components/CloneEventWizard';
import { ManageEvents } from '@/features/events/components/ManageEvents';
import { EventWorkspaceNav } from '@/features/events/components/EventWorkspaceNav';
import { SetupChecklist } from '@/features/events/components/SetupChecklist';

const state = vi.hoisted(() => ({ push: vi.fn(), actions: [] as string[], path: '/overview' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('@/shared/lib/appPath', () => ({
  useAppPathname: () => state.path,
  appHref: (href: string) => href,
  useAppHref: () => (href: string) => href,
}));
vi.mock('@/features/session', () => ({
  useCurrentSession: () => ({ volunteerId: 'admin' }),
  useAllows: () => (action: string) => state.actions.includes(action),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const organisation = {
  id: 'org_test',
  name: 'Organisation',
  timezone: 'Asia/Singapore',
  locale: 'en-SG',
  canCreate: true,
  canClone: true,
};
const source = {
  id: 'evt_source',
  organisationId: organisation.id,
  slug: 'source',
  name: 'Previous Event',
  timezone: 'Asia/Singapore',
  locale: 'en-SG',
  status: 'ARCHIVED' as const,
  venue: 'Campus',
};
const result = {
  joined: true,
  event: {
    id: 'evt_created',
    name: 'New Event',
    slug: 'new-event',
    timezone: 'Asia/Singapore',
    locale: 'en-SG',
    status: 'DRAFT',
  },
};
const clients: QueryClient[] = [];

function show(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  return client;
}
function fillBasics(): void {
  fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'New Event' } });
  fireEvent.change(screen.getByLabelText('Event address'), { target: { value: 'new-event' } });
  fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'Campus' } });
  fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2027-02-01' } });
  fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2027-02-02' } });
}
beforeEach(() => {
  mockedApi.mockReset();
  state.push.mockReset();
  state.actions = ['Settings.Read', 'People.Read', 'Schedule.Manage', 'Report.Generate'];
  state.path = '/overview';
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

it('requires valid basics, reviews the explicit default joining, then opens Setup after creation', async () => {
  mockedApi.mockResolvedValue(result);
  show(<CreateEventWizard organisation={organisation} />);
  expect((screen.getByLabelText('Join new event as Admin') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Review event' }));
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  expect(mockedApi).not.toHaveBeenCalled();
  fillBasics();
  fireEvent.click(screen.getByRole('button', { name: 'Review event' }));
  expect(screen.getByText(/You will join the new event as Admin/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Create event' }));
  await waitFor(() => expect(state.push).toHaveBeenCalledWith('/e/new-event/setup'));
  expect(mockedApi).toHaveBeenCalledWith('/events', {
    method: 'POST',
    body: expect.objectContaining({
      organisationId: organisation.id,
      timezone: 'Asia/Singapore',
      joinAsAdmin: true,
      idempotencyKey: expect.any(String),
    }),
  });
});

it('allows creating without joining, and reuses one receipt after a failed request', async () => {
  mockedApi
    .mockRejectedValueOnce(new Error('Connection interrupted'))
    .mockResolvedValue({ ...result, joined: false });
  show(<CreateEventWizard organisation={organisation} />);
  fillBasics();
  fireEvent.click(screen.getByLabelText('Join new event as Admin'));
  fireEvent.click(screen.getByRole('button', { name: 'Review event' }));
  expect(screen.getByText(/without joining its roster/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Create event' }));
  await screen.findByText('Connection interrupted');
  const first = mockedApi.mock.calls[0]?.[1]?.body;
  fireEvent.click(screen.getByRole('button', { name: 'Create event' }));
  await screen.findByText('Created New Event. You have not joined its roster.');
  expect(mockedApi.mock.calls[1]?.[1]?.body).toEqual(first);
  expect(state.push).not.toHaveBeenCalled();
});

it('validates clone basics and reviews selected parts, source, shift offset and invited people', async () => {
  mockedApi.mockResolvedValue(result);
  show(<CloneEventWizard source={source} />);
  expect(screen.getByText(/source is archived/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Review clone' }));
  expect(
    (screen.getByLabelText('New event address') as HTMLInputElement).getAttribute('aria-invalid'),
  ).toBe('true');
  fireEvent.change(screen.getByLabelText('New event address'), { target: { value: 'new-event' } });
  fireEvent.change(screen.getByLabelText('Move every day by'), { target: { value: '400' } });
  fireEvent.click(screen.getByLabelText('Visitor categories'));
  fireEvent.click(screen.getByLabelText('Invite the same active people'));
  fireEvent.click(screen.getByRole('button', { name: 'Review clone' }));
  expect(screen.getByText(/Days move by 400/)).toBeTruthy();
  expect(screen.getByText('The same active people will be invited again.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Create event' }));
  await waitFor(() => expect(state.push).toHaveBeenCalledWith('/e/new-event/setup'));
  expect(mockedApi).toHaveBeenCalledWith('/events/clone', {
    method: 'POST',
    body: expect.objectContaining({
      sourceEventId: source.id,
      joinAsAdmin: true,
      clone: expect.objectContaining({
        dayOffsetDays: 400,
        inviteSamePeople: true,
        copy: expect.objectContaining({ categories: false, content: true }),
      }),
    }),
  });
});

it('offers archived clone sources only when current organisation policies allow cloning', async () => {
  mockedApi.mockResolvedValue({ organisations: [organisation], events: [source] });
  show(<ManageEvents />);
  fireEvent.click(await screen.findByRole('button', { name: 'Clone Previous Event' }));
  expect(screen.getByRole('heading', { name: 'Clone Previous Event' })).toBeTruthy();
  cleanup();
  mockedApi.mockResolvedValue({
    organisations: [{ ...organisation, canClone: false }],
    events: [source],
  });
  show(<ManageEvents />);
  await screen.findByRole('button', { name: 'Create new event' });
  expect(screen.queryByRole('button', { name: 'Clone Previous Event' })).toBeNull();
});

it('shows load failures instead of offering unchecked event management', async () => {
  mockedApi.mockRejectedValue(new Error('Unavailable'));
  show(<ManageEvents />);
  await screen.findByText('Event management could not be loaded.');
  expect(screen.queryByRole('button', { name: 'Create new event' })).toBeNull();
});

it('derives workspace and setup links from policy-gated navigation and marks the active section', () => {
  show(
    <>
      <EventWorkspaceNav />
      <SetupChecklist />
    </>,
  );
  const nav = screen.getByRole('navigation', { name: 'Event workspace' });
  expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Overview');
  expect(screen.getByRole('link', { name: 'Schedule' }).getAttribute('href')).toBe(
    '/admin/schedule',
  );
  expect(screen.getByRole('link', { name: /^Content/ }).getAttribute('href')).toBe(
    '/admin/content',
  );
  cleanup();
  state.actions = [];
  show(<EventWorkspaceNav />);
  expect(screen.queryByRole('navigation', { name: 'Event workspace' })).toBeNull();
});
