import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CardPrintExportDetail, CardPrintExportRecord } from '@spoh/shared';
import { CardPrintHistory } from '@/features/cards/components/CardPrintHistory';
import CardAdminScreen from '@/features/cards/screens/CardAdminScreen';
import { getCardPrintDetails, listCardPrintExports } from '@/features/cards/api';
import { cardPrintKeys, useCardPrintDownload } from '@/features/cards/queries';
import { ApiError } from '@/shared/lib/apiErrors';

const state = vi.hoisted(() => ({
  eventId: 'event-a',
  personId: 'reader-a',
  actions: ['Report.Export'],
  api: vi.fn(),
  blob: vi.fn(),
}));
vi.mock('@/features/session', () => ({
  useCurrentSession: () => (state.personId ? { volunteerId: state.personId } : null),
  useRequireSession: () => (state.personId ? { volunteerId: state.personId } : null),
  useAllows: () => (action: string) => state.actions.includes(action),
  useEventTime: () => ({ dateTime: (value: string) => `Event clock: ${value}` }),
}));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => state.eventId,
  useOptionalEvent: () => null,
}));
vi.mock('@/shared/lib/eventApi', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventApi')>()),
  eventApi: state.api,
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  apiBlob: state.blob,
}));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/shared/ui/ButtonLink', () => ({
  ButtonLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const pdf: CardPrintExportRecord = {
  id: 'print-a',
  format: 'pdf',
  count: 2,
  rehearsal: true,
  createdAt: '2026-10-10T01:00:00Z',
};
const zip: CardPrintExportRecord = {
  ...pdf,
  id: 'print-b',
  format: 'zip',
  createdAt: '2026-10-09T01:00:00Z',
};
const detail: CardPrintExportDetail = {
  ...pdf,
  shortCodes: ['ABC123', 'DEF456'],
  printContext: {
    eventName: 'Frozen event name',
    stampingStations: [{ id: 'station-a', name: 'Frozen station name' }],
    batches: [
      { shortCode: 'ABC123', batchLabel: 'Morning batch' },
      { shortCode: 'DEF456', batchLabel: null },
    ],
  },
};
const clients: QueryClient[] = [];
function envelope(data: CardPrintExportRecord[], nextCursor: string | null = null) {
  return { data, meta: { count: data.length, nextCursor } };
}
function show(node: ReactNode = <CardPrintHistory />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrap = (child: ReactNode) => (
    <QueryClientProvider client={client}>{child}</QueryClientProvider>
  );
  return { client, wrap, ...render(wrap(node)) };
}
function denied(status = 403) {
  return new ApiError(status, {
    code: 'FORBIDDEN',
    message: 'Private server detail',
    requestId: 'synthetic-denied',
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
function DownloadProbe() {
  const download = useCardPrintDownload();
  return <button onClick={() => download.mutate(pdf)}>Download probe</button>;
}
beforeEach(() => {
  state.eventId = 'event-a';
  state.personId = 'reader-a';
  state.actions = ['Report.Export'];
  state.api.mockReset();
  state.blob.mockReset();
  state.api.mockImplementation(async (_event, path) => {
    if (path.includes('/details'))
      return {
        data: path.includes('print-b') ? { ...zip, shortCodes: [], printContext: null } : detail,
      };
    if (path === '/cards/print?limit=20') return envelope([pdf], zip.id);
    if (path === '/cards/print?limit=20&cursor=print-b') return envelope([zip]);
    throw new Error(`Unexpected request ${path}`);
  });
  state.blob.mockResolvedValue(new Blob(['synthetic print']));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-print');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
});

it('reads stored exports for a non-generator, pages older files and uses frozen labels', async () => {
  show(<CardAdminScreen />);
  expect(screen.queryByRole('button', { name: 'Generate card batch' })).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'View export print-a' }));
  await screen.findByText('Frozen event name: Frozen event name');
  expect(screen.getByText('Printed codes: ABC123, DEF456')).toBeTruthy();
  expect(screen.getByText('Stamping stations: Frozen station name')).toBeTruthy();
  expect(screen.getByText('ABC123: Morning batch')).toBeTruthy();
  expect(screen.getByText('DEF456: No batch label')).toBeTruthy();
  expect(screen.getByText(`Event clock: ${pdf.createdAt}`)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Load older print exports' }));
  fireEvent.click(await screen.findByRole('button', { name: 'View export print-b' }));
  await screen.findByText('This older export has no saved print context.');
  expect(screen.getByText('This older export has no saved card membership.')).toBeTruthy();
  expect(screen.queryByText('Frozen event name: Frozen event name')).toBeNull();
  expect(state.api).toHaveBeenCalledWith('event-a', '/cards/print?limit=20&cursor=print-b', {
    cache: 'no-store',
    signal: expect.any(AbortSignal),
  });
});
it('fetches stored history again after reload instead of relying on the last generation result', async () => {
  const view = show();
  await screen.findByRole('button', { name: 'View export print-a' });
  view.rerender(view.wrap(null));
  await waitFor(() =>
    expect(view.client.getQueryData(cardPrintKeys.history('event-a', 'reader-a'))).toBeUndefined(),
  );
  view.rerender(view.wrap(<CardPrintHistory />));
  await screen.findByRole('button', { name: 'View export print-a' });
  expect(state.api.mock.calls.filter(([, path]) => path === '/cards/print?limit=20')).toHaveLength(
    2,
  );
});
it.each(['event', 'person', 'signed-out', 'permission'])(
  'discards selected details and cached history after %s changes',
  async (change) => {
    const view = show();
    fireEvent.click(await screen.findByRole('button', { name: 'View export print-a' }));
    await screen.findByText('Frozen event name: Frozen event name');
    if (change === 'event') state.eventId = 'event-b';
    else if (change === 'person') state.personId = 'reader-b';
    else if (change === 'signed-out') state.personId = '';
    else state.actions = [];
    view.rerender(view.wrap(<CardPrintHistory />));
    expect(screen.queryByText('Frozen event name: Frozen event name')).toBeNull();
    await waitFor(() =>
      expect(
        view.client.getQueryCache().findAll({ queryKey: ['event-a', 'card-print', 'reader-a'] }),
      ).toHaveLength(0),
    );
    if (change === 'event' || change === 'person')
      await screen.findByRole('button', { name: 'View export print-a' });
    else expect(screen.queryByRole('button', { name: /^View export/ })).toBeNull();
  },
);
it.each([401, 403])(
  'drops all stored data after a %s detail refusal and does not expose server details',
  async (status) => {
    const view = show();
    state.api.mockImplementation(async (_event, path) => {
      if (path.includes('/details')) throw denied(status);
      return envelope([pdf]);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'View export print-a' }));
    await screen.findByText('Print export access is unavailable. Reload your session.');
    expect(screen.queryByRole('button', { name: /^View export/ })).toBeNull();
    expect(screen.queryByText('Private server detail')).toBeNull();
    await waitFor(() =>
      expect(
        view.client.getQueryCache().findAll({ queryKey: ['event-a', 'card-print', 'reader-a'] }),
      ).toHaveLength(0),
    );
  },
);
it('drops prior list and details when a refreshed history read loses authority', async () => {
  const view = show();
  fireEvent.click(await screen.findByRole('button', { name: 'View export print-a' }));
  await screen.findByText('Frozen event name: Frozen event name');
  state.api.mockRejectedValue(denied());
  await act(async () => {
    await view.client.invalidateQueries({ queryKey: cardPrintKeys.history('event-a', 'reader-a') });
  });
  await screen.findByText('Print export access is unavailable. Reload your session.');
  expect(screen.queryByText('Frozen event name: Frozen event name')).toBeNull();
  await waitFor(() =>
    expect(
      view.client.getQueryCache().findAll({ queryKey: ['event-a', 'card-print', 'reader-a'] }),
    ).toHaveLength(0),
  );
});
it('shows an empty list and retries a failed history read without displaying stale records', async () => {
  state.api
    .mockRejectedValueOnce(new Error('Private transport detail'))
    .mockResolvedValue(envelope([]));
  show();
  await screen.findByText('Print history is unavailable.');
  expect(screen.queryByText('Private transport detail')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry print history' }));
  await screen.findByText('No print exports yet');
});
it('retries a failed detail read and downloads the selected stored file with a revoked object URL', async () => {
  show();
  state.api.mockImplementation(async (_event, path) => {
    if (path.includes('/details')) throw new Error('temporary failure');
    return envelope([pdf]);
  });
  fireEvent.click(await screen.findByRole('button', { name: 'View export print-a' }));
  await screen.findByText('Export details are unavailable.');
  state.api.mockResolvedValue({ data: detail });
  fireEvent.click(screen.getByRole('button', { name: 'Retry export details' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Download stored PDF' }));
  await waitFor(() =>
    expect(state.blob).toHaveBeenCalledWith('/events/event-a/cards/print/print-a'),
  );
  await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-print'));
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
});
it('offers a safe retry after a download failure and drops the reader after a download refusal', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'View export print-a' }));
  state.blob.mockRejectedValueOnce(new Error('Offline')).mockRejectedValueOnce(denied());
  fireEvent.click(await screen.findByRole('button', { name: 'Download stored PDF' }));
  await screen.findByText('Could not download this stored print file. Try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Download stored PDF' }));
  await screen.findByText('Print export access is unavailable. Reload your session.');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it.each(['unmount', 'event', 'person', 'permission', 'returning-person'])(
  'discards a late download after %s changes',
  async (change) => {
    const late = deferred<Blob>();
    state.blob.mockReturnValue(late.promise);
    const view = show(<DownloadProbe />);
    fireEvent.click(screen.getByRole('button', { name: 'Download probe' }));
    await waitFor(() => expect(state.blob).toHaveBeenCalledOnce());
    if (change === 'unmount') view.unmount();
    else {
      if (change === 'event') state.eventId = 'event-b';
      else if (change === 'permission') state.actions = [];
      else state.personId = 'reader-b';
      view.rerender(view.wrap(<DownloadProbe />));
      if (change === 'returning-person') {
        state.personId = 'reader-a';
        view.rerender(view.wrap(<DownloadProbe />));
      }
    }
    await act(async () => {
      late.resolve(new Blob(['late print']));
      await late.promise;
    });
    await waitFor(() =>
      expect(
        view.client
          .getMutationCache()
          .getAll()
          .every((mutation) => mutation.state.status !== 'pending'),
      ).toBe(true),
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  },
);
it('rejects mismatched and malformed detail responses and encodes event, export and cursor paths', async () => {
  state.api
    .mockResolvedValueOnce({ data: { ...detail, id: 'other' } })
    .mockResolvedValueOnce({ data: { ...detail, shortCodes: ['bad'] } });
  await expect(getCardPrintDetails('event/with space', 'print/with space')).rejects.toThrow(
    'not the selected file',
  );
  await expect(getCardPrintDetails('event-a', pdf.id)).rejects.toThrow();
  expect(state.api).toHaveBeenNthCalledWith(
    1,
    'event/with space',
    '/cards/print/print%2Fwith%20space/details',
    { cache: 'no-store', signal: undefined },
  );
  state.api.mockResolvedValue(envelope([]));
  await listCardPrintExports('event-a', 'cursor/with space');
  expect(state.api).toHaveBeenLastCalledWith(
    'event-a',
    '/cards/print?limit=20&cursor=cursor%2Fwith+space',
    { cache: 'no-store', signal: undefined },
  );
});

const generated = {
  batchLabel: 'Owner batch',
  created: 1,
  rehearsal: false,
  csv: 'shortCode,qrPayload,batchLabel,mode\nABC123,synthetic-qr,Owner batch,LIVE',
};
async function generateOwnerBatch() {
  fireEvent.change(screen.getByLabelText('Batch label'), { target: { value: 'Owner batch' } });
  fireEvent.change(screen.getByLabelText('Number of cards'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate card batch' }));
}
it.each(['event', 'person'])(
  'drops generated codes, print results and lookup state after %s changes',
  async (change) => {
    state.actions = ['Self.Read', 'Card.GenerateBatch', 'Report.Export'];
    state.api.mockImplementation(async (_event, path) => {
      if (path === '/cards/batch') return generated;
      if (path === '/cards/print') return { data: pdf };
      if (path === '/cards/ABC123')
        return {
          card: {
            id: 'card-a',
            shortCode: 'ABC123',
            status: 'VOIDED',
            rehearsal: false,
            stamps: [],
            redeemed: false,
          },
        };
      return envelope([]);
    });
    const view = show(<CardAdminScreen />);
    await generateOwnerBatch();
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare PDF' }));
    await screen.findByRole('button', { name: 'Download PDF' });
    fireEvent.change(screen.getByLabelText('Printed card code'), { target: { value: 'ABC123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find card' }));
    await screen.findByText('ABC123: VOIDED');
    if (change === 'event') state.eventId = 'event-b';
    else state.personId = 'reader-b';
    view.rerender(view.wrap(<CardAdminScreen />));
    expect(screen.queryByRole('button', { name: 'Prepare PDF' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).toBeNull();
    expect(screen.queryByText('ABC123: VOIDED')).toBeNull();
    expect((screen.getByLabelText('Batch label') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Printed card code') as HTMLInputElement).value).toBe('');
  },
);
it.each(['event', 'person'])(
  'does not attach a pending generation result to a new %s owner',
  async (change) => {
    state.actions = ['Card.GenerateBatch', 'Report.Export'];
    const late = deferred<typeof generated>();
    state.api.mockImplementation(async (_event, path) =>
      path === '/cards/batch' ? late.promise : envelope([]),
    );
    const view = show(<CardAdminScreen />);
    await generateOwnerBatch();
    await waitFor(() =>
      expect(state.api.mock.calls.some(([, path]) => path === '/cards/batch')).toBe(true),
    );
    if (change === 'event') state.eventId = 'event-b';
    else state.personId = 'reader-b';
    view.rerender(view.wrap(<CardAdminScreen />));
    await act(async () => {
      late.resolve(generated);
      await late.promise;
    });
    expect(screen.queryByText('1 live cards generated.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Prepare PDF' })).toBeNull();
    expect(state.api.mock.calls.filter(([, path]) => path === '/cards/print')).toHaveLength(0);
  },
);
it('invalidates stored print history only after successful print confirmation', async () => {
  state.actions = ['Card.GenerateBatch', 'Report.Export'];
  state.api.mockImplementation(async (_event, path) => {
    if (path === '/cards/batch') return generated;
    if (path === '/cards/print') return { data: pdf };
    return envelope([]);
  });
  const view = show(<CardAdminScreen />);
  const invalidate = vi.spyOn(view.client, 'invalidateQueries');
  await generateOwnerBatch();
  fireEvent.click(await screen.findByRole('button', { name: 'Prepare ZIP' }));
  await screen.findByRole('button', { name: 'Download PDF' });
  expect(state.api).toHaveBeenCalledWith('event-a', '/cards/print', {
    method: 'POST',
    body: { shortCodes: ['ABC123'], format: 'zip', idempotencyKey: expect.any(String) },
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['event-a', 'card-print'] });
});
