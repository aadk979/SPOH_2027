import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SnapshotHistory } from '@/features/reports/components/SnapshotHistory';
import { snapshotKeys, useSnapshotDownload } from '@/features/reports/queries';
import { ApiError } from '@/shared/lib/apiErrors';

const state = vi.hoisted(() => ({
  eventId: 'event-a',
  personId: 'reader-a',
  actions: ['Report.Generate', 'Report.Export'],
  list: vi.fn(),
  detail: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@/features/session', () => ({
  useCurrentSession: () => (state.personId ? { volunteerId: state.personId } : null),
  useAllows: () => (action: string) => state.actions.includes(action),
  useEventTime: () => ({ dateTime: (value: string) => value }),
}));
vi.mock('@/shared/lib/eventContext', () => ({ useEventId: () => state.eventId }));
vi.mock('@/features/reports/api', () => ({
  listReportSnapshots: state.list,
  readReportSnapshot: state.detail,
  downloadReportSnapshot: state.download,
  getReport: vi.fn(),
  createArchivePack: vi.fn(),
  listArchivePacks: vi.fn(),
}));
vi.mock('@/features/reports/components/ReportTotals', () => ({
  ReportTotals: ({ data }: { data: { total: number } }) => <p>Frozen private total {data.total}</p>,
}));

const snapshot = {
  id: 'snapshot-a',
  kind: 'FINAL',
  createdAt: 'event clock',
  supersededAt: null,
  rehearsalIncluded: false,
};
const clients: QueryClient[] = [];
function show(node: ReactNode = <SnapshotHistory />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrap = (child: ReactNode) => (
    <QueryClientProvider client={client}>{child}</QueryClientProvider>
  );
  return { client, wrap, ...render(wrap(node)) };
}
const denied = () =>
  new ApiError(403, {
    code: 'FORBIDDEN',
    message: 'This reader no longer has report access.',
    requestId: 'snapshot-test',
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
async function selectSnapshot() {
  fireEvent.click(await screen.findByRole('button', { name: 'FINAL · event clock' }));
}
function DownloadProbe() {
  const download = useSnapshotDownload();
  return (
    <>
      <button onClick={() => download.mutate({ id: snapshot.id, format: 'xlsx' })}>
        Download probe
      </button>
      {download.error ? <p role="alert">{download.error.message}</p> : null}
    </>
  );
}
function changeOwner(change: string) {
  if (change === 'event') state.eventId = 'event-b';
  if (change === 'person') state.personId = 'reader-b';
  if (change === 'signed-out') state.personId = '';
  if (change === 'permission') state.actions = [];
}
beforeEach(() => {
  state.eventId = 'event-a';
  state.personId = 'reader-a';
  state.actions = ['Report.Generate', 'Report.Export'];
  state.list
    .mockReset()
    .mockResolvedValue({ data: [snapshot], meta: { count: 1, nextCursor: null } });
  state.detail.mockReset().mockResolvedValue({ total: 23 });
  state.download.mockReset().mockResolvedValue(new Blob(['synthetic frozen workbook']));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-snapshot');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

it.each(['list', 'detail'])(
  'hides frozen data and purges the same reader cache after a %s refusal',
  async (source) => {
    const view = show();
    await selectSnapshot();
    await screen.findByText('Frozen private total 23');
    state[source === 'list' ? 'list' : 'detail'].mockRejectedValueOnce(denied());
    await act(() =>
      view.client.invalidateQueries({
        queryKey: [...snapshotKeys.owner('event-a', 'reader-a'), source],
      }),
    );
    await screen.findByText('Report history access is unavailable. Reload your session.');
    expect(screen.queryByText('Frozen private total 23')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download frozen XLSX' })).toBeNull();
    await waitFor(() =>
      expect(
        view.client.getQueryCache().findAll({
          queryKey: snapshotKeys.owner('event-a', 'reader-a'),
        }),
      ).toHaveLength(0),
    );
  },
);

it.each(['person', 'event', 'signed-out', 'permission', 'unmount'])(
  'aborts a prior reader detail after %s changes and ignores its late response',
  async (change) => {
    const response = deferred<{ total: number }>();
    state.detail.mockReturnValueOnce(response.promise);
    const view = show();
    await selectSnapshot();
    await waitFor(() => expect(state.detail).toHaveBeenCalledTimes(1));
    const signal = state.detail.mock.calls[0]![2] as AbortSignal;
    expect(signal.aborted).toBe(false);
    changeOwner(change);
    if (change === 'unmount') view.unmount();
    else view.rerender(view.wrap(<SnapshotHistory />));
    await waitFor(() => expect(signal.aborted).toBe(true));
    await act(async () => {
      response.resolve({ total: 99 });
      await response.promise;
    });
    expect(screen.queryByText('Frozen private total 99')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download frozen XLSX' })).toBeNull();
    await waitFor(() =>
      expect(
        view.client.getQueryCache().findAll({
          queryKey: snapshotKeys.owner('event-a', 'reader-a'),
        }),
      ).toHaveLength(0),
    );
  },
);

it.each(['person', 'event', 'signed-out', 'permission'])(
  'drops a previously selected frozen record when %s changes',
  async (change) => {
    const view = show();
    await selectSnapshot();
    await screen.findByText('Frozen private total 23');
    changeOwner(change);
    view.rerender(view.wrap(<SnapshotHistory />));
    expect(screen.queryByText('Frozen private total 23')).toBeNull();
    await waitFor(() =>
      expect(
        view.client.getQueryCache().findAll({
          queryKey: snapshotKeys.owner('event-a', 'reader-a'),
        }),
      ).toHaveLength(0),
    );
  },
);

it('downloads the selected frozen file and always revokes its object URL', async () => {
  show();
  await selectSnapshot();
  fireEvent.click(await screen.findByRole('button', { name: 'Download frozen XLSX' }));
  await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));
  expect(state.download).toHaveBeenCalledWith('event-a', { id: snapshot.id, format: 'xlsx' });
  expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-snapshot');
});

it('does not start a download without the current export permission', async () => {
  state.actions = ['Report.Generate'];
  show(<DownloadProbe />);
  fireEvent.click(screen.getByRole('button', { name: 'Download probe' }));
  await screen.findByRole('alert');
  expect(state.download).not.toHaveBeenCalled();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});

it.each(['person', 'event', 'signed-out', 'permission', 'unmount'])(
  'does not publish a pending download after %s changes',
  async (change) => {
    const response = deferred<Blob>();
    state.download.mockReturnValueOnce(response.promise);
    const view = show(<DownloadProbe />);
    fireEvent.click(screen.getByRole('button', { name: 'Download probe' }));
    await waitFor(() => expect(state.download).toHaveBeenCalledTimes(1));
    changeOwner(change);
    if (change === 'unmount') view.unmount();
    else view.rerender(view.wrap(<DownloadProbe />));
    await act(async () => {
      response.resolve(new Blob(['late private workbook']));
      await response.promise;
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  },
);

it('a refused pending download cannot create a file and removes the selected private view', async () => {
  state.download.mockRejectedValueOnce(denied());
  const view = show();
  await selectSnapshot();
  fireEvent.click(await screen.findByRole('button', { name: 'Download frozen XLSX' }));
  await screen.findByText('Report history access is unavailable. Reload your session.');
  expect(screen.queryByText('Frozen private total 23')).toBeNull();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      view.client.getQueryCache().findAll({
        queryKey: snapshotKeys.owner('event-a', 'reader-a'),
      }),
    ).toHaveLength(0),
  );
});
