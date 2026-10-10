import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiBlob } from '@/shared/lib/api';
import { ArchiveExportPanel } from '@/features/reports/components/ArchiveExportPanel';
import { TEST_EVENT } from '../helpers/event';
const access = vi.hoisted(() => ({ allowed: true, status: 'CLOSED' }));
vi.mock('@/features/session', () => ({ useAllows: () => () => access.allowed,
  useEventTime: () => ({ dateTime: (value: string) => value }) }));
vi.mock('@/shared/lib/eventContext', async (original) => ({ ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => TEST_EVENT.id, useEvent: () => ({ ...TEST_EVENT, status: access.status }) }));
vi.mock('@/shared/lib/api', () => ({ api: vi.fn(), apiBlob: vi.fn() }));
const call = vi.mocked(api);
const pack = { id: 'pack_one', eventId: TEST_EVENT.id, snapshotId: 'final_report', objectKey: 'exports/synthetic.xlsx',
  createdAt: '2026-10-10T00:00:00.000Z', downloadPath: `/events/${TEST_EVENT.id}/reports/archive-export/pack_one` };
const clients: QueryClient[] = [];
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client); render(<QueryClientProvider client={client}><ArchiveExportPanel /></QueryClientProvider>);
}
beforeEach(() => { access.allowed = true; access.status = 'CLOSED'; call.mockReset(); vi.mocked(apiBlob).mockReset(); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });
describe('archive export', () => {
  it('reviews creation and downloads a stored pack without a token in its URL', async () => {
    let created = false;
    call.mockImplementation(async (_path, input) => {
      if (input?.method === 'POST') { created = true; return { data: pack }; }
      return { data: created ? [pack] : [] };
    });
    vi.mocked(apiBlob).mockResolvedValue(new Blob(['synthetic workbook']));
    const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    show(); fireEvent.click(screen.getByRole('button', { name: 'Prepare archive export' }));
    expect(call.mock.calls.every(([, input]) => !input?.method)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save export pack' }));
    await screen.findByText(/Export pack saved/);
    fireEvent.click(await screen.findByRole('button', { name: /Download pack/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(apiBlob).toHaveBeenCalledWith(pack.downloadPath); expect(url).toHaveBeenCalled(); expect(revoke).toHaveBeenCalledWith('blob:synthetic');
    expect(call.mock.calls.find(([, input]) => input?.method === 'POST')?.[1]?.body).toEqual({ idempotencyKey: expect.any(String) });
  });
  it('keeps a stable creation receipt after failure and refuses a foreign export', async () => {
    call.mockImplementation(async (_path, input) => { if (input?.method === 'POST') throw new Error('Storage unavailable'); return { data: [] }; });
    show(); fireEvent.click(screen.getByRole('button', { name: 'Prepare archive export' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save export pack' }));
    await screen.findByText('Storage unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Save export pack' }));
    await waitFor(() => expect(call.mock.calls.filter(([, input]) => input?.method === 'POST')).toHaveLength(2));
    const writes = call.mock.calls.filter(([, input]) => input?.method === 'POST'); expect(writes[0]![1]?.body).toEqual(writes[1]![1]?.body);
    cleanup(); call.mockResolvedValue({ data: [{ ...pack, eventId: 'foreign_event' }] }); show();
    await screen.findByText('The exports belong to another event'); expect(screen.queryByRole('button', { name: /Download pack/ })).toBeNull();
  });
  it('offers creation only after close and respects permission', () => {
    call.mockResolvedValue({ data: [] }); access.status = 'LIVE'; show();
    expect(screen.queryByRole('button', { name: 'Prepare archive export' })).toBeNull(); cleanup(); access.allowed = false; show();
    expect(screen.queryByRole('heading', { name: 'After the event' })).toBeNull();
  });
});
