import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhotoRead } from '@/features/media/components/PhotoRead';
import { VisitorRecordsPanel } from '@/features/visitor/components/VisitorRecordsPanel';
import { ApiError } from '@/shared/lib/apiErrors';
const transport = vi.hoisted(() => ({
  api: vi.fn(),
  person: 'reader-a',
  event: 'event-a',
  role: 'IC',
  allowed: true,
}));
vi.mock('@/features/session', () => ({
  useCurrentSession: () => ({ volunteerId: transport.person, role: transport.role }),
  useAllows: () => () => transport.allowed,
  useEventTime: () => ({ dateTime: (value: string) => value }),
}));
vi.mock('@/shared/lib/eventContext', () => ({ useEventId: () => transport.event }));
vi.mock('@/shared/lib/eventApi', () => ({ eventApi: transport.api }));
const id = ['0'.repeat(8), '0'.repeat(4), '4000', '8000', '0'.repeat(12)].join('-');
function mount(child: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
  return { client, view };
}
beforeEach(() => {
  transport.api.mockReset();
  transport.person = 'reader-a';
  transport.event = 'event-a';
  transport.role = 'IC';
  transport.allowed = true;
});
afterEach(cleanup);
it('reads a private photo only on request and permits a fresh URL after expiry', async () => {
  transport.api
    .mockResolvedValueOnce({ url: 'https://photo.invalid/first', expiresIn: 60 })
    .mockResolvedValueOnce({ url: 'https://photo.invalid/second', expiresIn: 60 });
  mount(<PhotoRead objectKey="event-a/photos/item one" label="Blue bottle" />);
  expect(transport.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View photo of Blue bottle' }));
  const link = await screen.findByRole('link', { name: 'Open photo of Blue bottle' });
  expect(link.getAttribute('href')).toBe('https://photo.invalid/first');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(transport.api).toHaveBeenCalledWith(
    'event-a',
    '/media/url?key=event-a%2Fphotos%2Fitem%20one',
  );
  fireEvent.click(screen.getByRole('button', { name: 'View photo of Blue bottle' }));
  await waitFor(() => expect(link.getAttribute('href')).toBe('https://photo.invalid/second'));
});
it('shows a photo refusal without inventing a public object link', async () => {
  transport.api.mockRejectedValue(new Error('This photo is no longer retained.'));
  mount(<PhotoRead objectKey="private-key" label="Bottle" />);
  fireEvent.click(screen.getByRole('button', { name: 'View photo of Bottle' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('link')).toBeNull();
});
it('keeps visitor values out of the page and cache until explicitly opened, then discards them on hide', async () => {
  transport.api.mockResolvedValue({
    fields: [
      {
        id,
        code: 'school',
        label: 'School',
        type: 'text',
        classification: 'visitor-personal',
        retentionDays: 7,
        readers: ['IC'],
        sortOrder: 0,
        active: true,
      },
    ],
    data: [
      {
        registrationId: id,
        rehearsal: true,
        recordedAt: '2027-01-07T01:00:00.000Z',
        values: { school: 'Sample school', hidden: 'Private value' },
      },
    ],
  });
  const { client } = mount(<VisitorRecordsPanel />);
  expect(transport.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Read permitted visitor values' }));
  await screen.findByText('Sample school');
  expect(screen.queryByText('Private value')).toBeNull();
  expect(transport.api).toHaveBeenCalledWith('event-a', '/visitors', { cache: 'no-store', signal: expect.any(AbortSignal) });
  fireEvent.click(screen.getByRole('button', { name: 'Hide visitor values' }));
  expect(screen.queryByText('Sample school')).toBeNull();
  await waitFor(() =>
    expect(
      client.getQueryCache().findAll({ queryKey: ['event-a', 'visitor-records'] }),
    ).toHaveLength(0),
  );
});
it('separates retained visitor reads by person and reports empty and refused reads', async () => {
  transport.api
    .mockResolvedValueOnce({ fields: [], data: [] })
    .mockRejectedValueOnce(new Error('Your reader permission changed.'));
  const { view } = mount(<VisitorRecordsPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Read permitted visitor values' }));
  await screen.findByText('No retained visitor values');
  transport.person = 'reader-b';
  view.rerender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <VisitorRecordsPanel />
    </QueryClientProvider>,
  );
  expect(screen.queryByText('No retained visitor values')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Read permitted visitor values' }));
  await screen.findByText('Reading visitor values was not confirmed');
  expect(screen.queryByText('Your reader permission changed.')).toBeNull();
});

const denied = () =>
  new ApiError(403, {
    code: 'FORBIDDEN',
    message: 'Your reader permission changed.',
    requestId: 'private-read-test',
  });
const visitorValues = (value: string) => ({
  fields: [
    {
      id,
      code: 'school',
      label: 'School',
      type: 'text',
      classification: 'visitor-personal',
      retentionDays: 7,
      readers: ['IC'],
      sortOrder: 0,
      active: true,
    },
  ],
  data: [
    {
      registrationId: id,
      rehearsal: true,
      recordedAt: '2027-01-07T01:00:00.000Z',
      values: { school: value },
    },
  ],
});
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function rerender(child: React.ReactNode, mounted: ReturnType<typeof mount>) {
  mounted.view.rerender(<QueryClientProvider client={mounted.client}>{child}</QueryClientProvider>);
}

it('discards successful visitor values and their cache when the same reader is later refused', async () => {
  transport.api.mockResolvedValueOnce(visitorValues('Retained private school'));
  const mounted = mount(<VisitorRecordsPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Read permitted visitor values' }));
  await screen.findByText('Retained private school');
  transport.api.mockRejectedValueOnce(denied());
  await act(() => mounted.client.invalidateQueries({ queryKey: ['event-a', 'visitor-records'] }));
  await screen.findByText('Your reader permission changed.');
  expect(screen.queryByText('Retained private school')).toBeNull();
  await waitFor(() =>
    expect(
      mounted.client.getQueryCache().findAll({
        queryKey: ['event-a', 'visitor-records'],
      }),
    ).toHaveLength(0),
  );
});

it.each(['hide', 'person', 'event', 'role', 'permission'])(
  'fences a pending visitor reply after %s changes',
  async (change) => {
    const response = deferred();
    transport.api.mockReturnValueOnce(response.promise);
    const mounted = mount(<VisitorRecordsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Read permitted visitor values' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledTimes(1));
    if (change === 'hide')
      fireEvent.click(screen.getByRole('button', { name: 'Hide visitor values' }));
    if (change === 'person') transport.person = 'reader-b';
    if (change === 'event') transport.event = 'event-b';
    if (change === 'role') transport.role = 'VOLUNTEER';
    if (change === 'permission') transport.allowed = false;
    rerender(<VisitorRecordsPanel />, mounted);
    await act(async () => {
      response.resolve(visitorValues('Late private school'));
    });
    expect(screen.queryByText('Late private school')).toBeNull();
    await waitFor(() =>
      expect(
        mounted.client.getQueryCache().findAll({
          queryKey: ['event-a', 'visitor-records'],
        }),
      ).toHaveLength(0),
    );
  },
);

it('removes an existing signed photo link on a fresh refusal', async () => {
  transport.api.mockResolvedValueOnce({ url: 'https://photo.invalid/first', expiresIn: 60 });
  mount(<PhotoRead objectKey="private-key" label="Bottle" />);
  fireEvent.click(screen.getByRole('button', { name: 'View photo of Bottle' }));
  await screen.findByRole('link');
  transport.api.mockRejectedValueOnce(denied());
  fireEvent.click(screen.getByRole('button', { name: 'View photo of Bottle' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('link')).toBeNull();
});

it.each(['person', 'event', 'role', 'permission', 'unmount'])(
  'fences a pending signed-photo reply after %s changes',
  async (change) => {
    const response = deferred();
    transport.api.mockReturnValueOnce(response.promise);
    const mounted = mount(<PhotoRead objectKey="private-key" label="Bottle" />);
    fireEvent.click(screen.getByRole('button', { name: 'View photo of Bottle' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledTimes(1));
    if (change === 'person') transport.person = 'reader-b';
    if (change === 'event') transport.event = 'event-b';
    if (change === 'role') transport.role = 'VOLUNTEER';
    if (change === 'permission') transport.allowed = false;
    if (change === 'unmount') mounted.view.unmount();
    else rerender(<PhotoRead objectKey="private-key" label="Bottle" />, mounted);
    await act(async () => {
      response.resolve({ url: 'https://photo.invalid/late-private-url', expiresIn: 60 });
    });
    expect(screen.queryByRole('link')).toBeNull();
    await waitFor(() =>
      expect(
        JSON.stringify(
          mounted.client
            .getMutationCache()
            .getAll()
            .map((mutation) => mutation.state.data),
        ),
      ).not.toContain('late-private-url'),
    );
  },
);
