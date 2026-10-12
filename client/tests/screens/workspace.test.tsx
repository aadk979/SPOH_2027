import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityKind, type EntityResponse, type RecordsResponse } from '@spoh/shared';
import { api, ApiError } from '@/shared/lib/api';
import { EntityScreen, RecordsScreen, SearchScreen } from '@/features/workspace';

const state = vi.hoisted(() => ({ personId: 'reader-a', eventId: 'event-a', params: 'kind=station&id=station-a',
  actions: {} as Record<string, boolean>, permissionError: null as Error | null, pushes: [] as string[] }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(state.params),
  usePathname: () => '/entity', useRouter: () => ({ push: (path: string) => state.pushes.push(path), replace: vi.fn() }) }));
vi.mock('@/features/session', () => ({
  useRequireSession: () => ({ volunteerId: state.personId }),
  useCurrentSession: () => ({ volunteerId: state.personId }),
  useMyPermissions: () => ({ isSuccess: !state.permissionError, error: state.permissionError, data: { actions: state.actions } }),
  useAllows: () => (action: string) => !state.permissionError && state.actions[action] === true,
  useEventTime: () => ({ dateTime: (value: string) => value, time: (value: string) => value }),
}));
vi.mock('@/shared/lib/eventContext', () => ({ useEventId: () => state.eventId, useOptionalEvent: () => null }));
vi.mock('@/shared/shell/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/shared/lib/api', async (original) => ({ ...(await original<typeof import('@/shared/lib/api')>()), api: vi.fn() }));
const mockedApi = vi.mocked(api);
const AS_OF = '2027-01-08T02:00:00.000Z';
const entity = (kind: EntityResponse['ref']['kind'] = 'station'): EntityResponse => ({
  ref: { kind, id: 'station-a' }, title: 'Visible record', fields: [{ label: 'Code', value: 'MixedCase', format: 'text' }],
  facets: [{ name: 'Roster', availability: 'denied', explanation: 'Roster detail is restricted.' }],
  related: [{ label: 'Exact captured rows', destination: { type: 'records', filter: { kind: 'footfall', stationId: 'station-a', includeRehearsal: false } } }],
  actions: [], asOf: AS_OF,
});
const recordPage = (last = false): RecordsResponse => ({ filter: { kind: 'footfall', stationId: 'station-a', includeRehearsal: false, asOf: AS_OF },
  asOf: AS_OF, data: [{ id: last ? 'row-b' : 'row-a', title: last ? 'One entry' : 'Bulk room count', recordedAt: AS_OF,
    fields: [{ label: 'Quantity', value: last ? 1 : 240, format: 'number' }], destination: { kind: 'footfall', id: last ? 'row-b' : 'row-a' }, related: [] }],
  aggregate: { value: 241, unit: 'roomEntries' }, meta: { count: 2, nextCursor: last ? null : 'row-a' } });
let client: QueryClient;
function draw(children: ReactNode) {
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  state.personId = 'reader-a'; state.eventId = 'event-a'; state.params = 'kind=station&id=station-a';
  state.actions = {}; state.permissionError = null; state.pushes = []; mockedApi.mockReset();
});
afterEach(() => { cleanup(); client.clear(); });

describe('scoped entity homes', () => {
  it.each([
    { Screen: EntityScreen, params: 'kind=station&id=station-a', operation: 'Loading this record' },
    { Screen: RecordsScreen, params: 'kind=footfall&stationId=station-a', operation: 'Loading these records' },
    { Screen: SearchScreen, params: 'query=Gallery', operation: 'Searching this event' },
  ])('$operation mounts no private observer when the current permission read fails', ({ Screen, params, operation }) => {
    state.params = params;
    state.permissionError = new ApiError(503, { code: 'POLICY_UNAVAILABLE', message: 'Private policy provider detail', requestId: 'permission-read-unavailable' });
    draw(<Screen />);
    expect(screen.getByRole('alert')).toHaveTextContent(`${operation} was not confirmed`);
    expect(screen.getByText('permission-read-unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Private policy provider detail')).not.toBeInTheDocument();
    expect(mockedApi).not.toHaveBeenCalled();
    expect(client.getQueriesData({ queryKey: ['event-a', 'workspace', 'reader-a'] })).toEqual([]);
  });
  it.each(EntityKind.options)('renders the safe %s projection and genuine related filter', async (kind) => {
    state.params = `kind=${kind}&id=station-a`;
    mockedApi.mockResolvedValue(entity(kind));
    draw(<EntityScreen />);
    await screen.findByText('Visible record');
    expect(screen.getByText('MixedCase')).toBeInTheDocument();
    expect(screen.getByText('Roster detail is restricted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exact captured rows' })).toHaveAttribute('href', '/records?kind=footfall&stationId=station-a&includeRehearsal=false');
    expect(mockedApi.mock.calls[0]?.[0]).toBe(`/events/event-a/workspace/entity?kind=${kind}&id=station-a`);
    expect(mockedApi.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', signal: expect.any(AbortSignal) });
  });
  it('rejects an ambiguous/forged reference without sending a read', () => {
    state.params = 'kind=person&id=person-a&via=assignment&assignmentId=a&stationId=b';
    draw(<EntityScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('Opening this record was not confirmed');
    expect(screen.getByRole('link', { name: 'Search this event' })).toHaveAttribute('href', '/search');
    expect(screen.queryByText(/invalid or incompatible filters/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveTextContent('assignmentId=a');
    expect(screen.getByRole('alert')).not.toHaveTextContent('person-a');
    expect(mockedApi).not.toHaveBeenCalled();
  });
  it.each([403, 404, 503])('hides the previous private body after %s and shows the request ID', async (status) => {
    mockedApi.mockResolvedValueOnce(entity());
    draw(<EntityScreen />); await screen.findByText('Visible record');
    mockedApi.mockRejectedValue(new ApiError(status, { code: status === 503 ? 'POLICY_UNAVAILABLE' : 'UNAVAILABLE',
      message: status === 503 ? 'Private workspace provider detail' : 'Access changed', requestId: 'safe-request-a' }));
    await act(() => client.invalidateQueries({ queryKey: ['event-a', 'workspace', 'reader-a'] }));
    await screen.findByText('safe-request-a');
    expect(screen.queryByText('Visible record')).not.toBeInTheDocument();
    expect(screen.queryByText('MixedCase')).not.toBeInTheDocument();
    expect(screen.queryByText('Private workspace provider detail')).not.toBeInTheDocument();
    if (status !== 503) expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  });
  it('discards previous event/person pages and aborts pending reads on owner change', async () => {
    let resolveOld: (value: unknown) => void = () => undefined;
    let signal: AbortSignal | undefined;
    mockedApi.mockImplementationOnce((_path, options) => {
      signal = options?.signal;
      return new Promise((resolve) => { resolveOld = resolve; });
    }).mockResolvedValue({ ...entity(), title: 'New owner record' });
    const view = draw(<EntityScreen />);
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(1));
    state.personId = 'reader-b'; state.eventId = 'event-b';
    view.rerender(<QueryClientProvider client={client}><EntityScreen /></QueryClientProvider>);
    await screen.findByText('New owner record');
    expect(signal?.aborted).toBe(true);
    await act(async () => resolveOld({ ...entity(), title: 'Previous private owner' }));
    expect(screen.queryByText('Previous private owner')).not.toBeInTheDocument();
    expect(client.getQueriesData({ queryKey: ['event-a', 'workspace', 'reader-a'] })).toEqual([]);
  });
  it('removes private cached projections when the current permission read fails', async () => {
    mockedApi.mockResolvedValue(entity());
    const view = draw(<EntityScreen />); await screen.findByText('Visible record');
    state.permissionError = new ApiError(403, { code: 'FORBIDDEN', message: 'Current access unavailable', requestId: 'policy-request' });
    view.rerender(<QueryClientProvider client={client}><EntityScreen /></QueryClientProvider>);
    await screen.findByText('policy-request');
    expect(screen.queryByText('Visible record')).not.toBeInTheDocument();
    await waitFor(() => expect(client.getQueriesData({ queryKey: ['event-a', 'workspace', 'reader-a'] })).toEqual([]));
  });
  it('aborts a pending private read on permission loss and cannot retain its late result', async () => {
    let finish: (value: unknown) => void = () => undefined;
    let signal: AbortSignal | undefined;
    mockedApi.mockImplementationOnce((_path, options) => {
      signal = options?.signal;
      return new Promise((resolve) => { finish = resolve; });
    });
    const view = draw(<EntityScreen />);
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(1));
    state.permissionError = new ApiError(403, { code: 'FORBIDDEN', message: 'Current access changed', requestId: 'permission-loss-pending' });
    view.rerender(<QueryClientProvider client={client}><EntityScreen /></QueryClientProvider>);
    await screen.findByText('permission-loss-pending');
    expect(signal?.aborted).toBe(true);
    await act(async () => finish({ ...entity(), title: 'Late private projection' }));
    expect(screen.queryByText('Late private projection')).not.toBeInTheDocument();
    await waitFor(() => expect(client.getQueriesData({ queryKey: ['event-a', 'workspace', 'reader-a'] })).toEqual([]));
    expect(mockedApi).toHaveBeenCalledTimes(1);
  });
  it('starts a fresh source read after the permission projection changes', async () => {
    mockedApi.mockResolvedValueOnce(entity()).mockResolvedValue({ ...entity(), title: 'Reduced current projection', fields: [] });
    const view = draw(<EntityScreen />); await screen.findByText('MixedCase');
    state.actions = { 'Self.Read': true };
    view.rerender(<QueryClientProvider client={client}><EntityScreen /></QueryClientProvider>);
    await screen.findByText('Reduced current projection');
    expect(screen.queryByText('MixedCase')).not.toBeInTheDocument();
  });
});

describe('record and search destinations', () => {
  it('shows quantity, full matching-row count, current page size and exact observation separately', async () => {
    state.params = 'kind=footfall&stationId=station-a&includeRehearsal=false';
    mockedApi.mockResolvedValueOnce(recordPage()).mockResolvedValue(recordPage(true));
    draw(<RecordsScreen />);
    await screen.findByText('241 room entries');
    expect(screen.getByText('2 records match these filters. 1 shown.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load older records' }));
    await screen.findByText('One entry');
    expect(screen.getByText('2 records match these filters. 2 shown.')).toBeInTheDocument();
    const request = new URL(`https://synthetic.test${mockedApi.mock.calls[1]![0]}`);
    expect(Object.fromEntries(request.searchParams)).toEqual({ kind: 'footfall', stationId: 'station-a', includeRehearsal: 'false',
      asOf: AS_OF, limit: '50', cursor: 'row-a' });
    expect(screen.queryByRole('button', { name: 'Load older records' })).not.toBeInTheDocument();
  });
  it('honestly displays an empty exact subset, full ledger balance and unavailable data', async () => {
    state.params = 'kind=gift-ledger&giftTypeId=gift-a&rehearsal=false';
    mockedApi.mockResolvedValue({ filter: { kind: 'gift-ledger', giftTypeId: 'gift-a', rehearsal: false }, asOf: AS_OF,
      data: [], aggregate: { value: 0, unit: 'stock', balance: 70, openingStock: 100, explanation: 'Balance uses all retained live pool history.' }, meta: { count: 0, nextCursor: null } });
    draw(<RecordsScreen />); await screen.findByText('No matching records');
    expect(screen.getByText('Pool balance: 70')).toBeInTheDocument();
    expect(screen.getByText('Opening stock: 100')).toBeInTheDocument();
    expect(screen.getByText('Balance uses all retained live pool history.')).toBeInTheDocument();
  });
  it('uses submitted search text, only safe entity destinations, and honest truncation', async () => {
    state.params = 'query=Gallery';
    mockedApi.mockResolvedValue({ data: [{ title: 'Gallery station', detail: 'Station code GAL', destination: { kind: 'station', id: 'station-a' } }],
      meta: { count: 20, truncated: true } });
    draw(<SearchScreen />); await screen.findByText('Gallery station');
    expect(screen.getByRole('link', { name: 'Gallery station' })).toHaveAttribute('href', '/entity?kind=station&id=station-a');
    expect(screen.getByRole('status')).toHaveTextContent('More matches are available');
    fireEvent.change(screen.getByLabelText('Station, person, card or record'), { target: { value: 'A & B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(state.pushes).toEqual(['/search?query=A+%26+B']);
  });
  it('does not send an empty search and distinguishes zero visible matches', async () => {
    state.params = '';
    const view = draw(<SearchScreen />);
    expect(screen.getByText('Find an event record')).toBeInTheDocument(); expect(api).not.toHaveBeenCalled();
    state.params = 'query=none'; mockedApi.mockResolvedValue({ data: [], meta: { count: 0, truncated: false } });
    view.rerender(<QueryClientProvider client={client}><SearchScreen /></QueryClientProvider>);
    await screen.findByText('No visible matches');
  });
  it('keeps an uncertain import undo receipt across the exact retry', async () => {
    state.params = 'kind=import&id=station-a'; state.actions = { 'Fallback.Import': true };
    const record = { ...entity('import'), actions: [{ label: 'Undo import', destination: { type: 'action' as const, path: '/chief/imports' as const, query: { id: 'station-a' } } }] };
    let attempts = 0;
    mockedApi.mockImplementation(async (path) => {
      if (path.includes('/workspace/entity')) return record;
      if (path.includes('/fallback/imports/station-a/undo')) {
        attempts += 1;
        if (attempts === 1) throw new ApiError(503, { code: 'UNAVAILABLE', message: 'Uncertain', requestId: 'undo-request' });
        return { importBatchId: 'station-a', voided: 2, alreadyVoided: 1, retained: 3 };
      }
      throw new Error(`Unexpected request ${path}`);
    });
    draw(<EntityScreen />); await screen.findByText('Undo this capture import');
    fireEvent.change(screen.getByLabelText('Reason for correction'), { target: { value: 'Duplicate fallback import' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review correction' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo this capture import' }));
    await screen.findAllByText('undo-request');
    expect(screen.queryByText('Uncertain')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo this capture import' }));
    await screen.findByText('Correction recorded; the original rows remain in history.');
    const writes = mockedApi.mock.calls.filter(([path]) => path.includes('/undo'));
    expect(writes).toHaveLength(2); expect(writes[0]![1]?.body).toEqual(writes[1]![1]?.body);
    expect(writes[0]![1]?.body).toMatchObject({ reason: 'Duplicate fallback import', idempotencyKey: expect.any(String) });
  });
});
