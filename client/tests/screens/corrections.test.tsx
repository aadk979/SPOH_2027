import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/shared/lib/api';
import { eventWallTimeInstant } from '@/shared/lib/eventWallTime';
import { BulkFootfallForm } from '@/features/corrections/components/BulkFootfallForm';
import { VoidRecordForm } from '@/features/corrections/components/VoidRecordForm';
import { recordBulkFootfall, recentCorrectionRecords, voidRecord } from '@/features/corrections/api';
import { TEST_EVENT } from '../helpers/event';

vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useEventTime: () => ({ dateTime: (iso: string) => iso }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()), api: vi.fn(),
}));
const mockApi = vi.mocked(api);
const base = `/events/${TEST_EVENT.id}`;
const at = '2027-01-07T01:00:00.000Z';
const registration = { id: 'reg-1', category: 'SEC_1', categoryLabel: 'Sec 1', stationId: 'hall', groupId: null, missionCardId: null, source: 'APP', recordedAt: at, clientRecordedAt: null, voided: false };
const footfall = { id: 'tick-1', stationId: 'hall', quantity: 4, source: 'PAPER', recordedAt: at, clientRecordedAt: null, timeBlockStart: at, voided: false };
function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function stations(path: string) {
  return path.endsWith('/stations') ? { data: [{ id: 'hall', name: 'Hall', code: 'HALL', active: true }] } : undefined;
}
beforeEach(() => { mockApi.mockReset(); });
afterEach(cleanup);

describe('the event-clock correction input', () => {
  it('uses the event zone rather than the device zone', () => {
    expect(eventWallTimeInstant('2027-01-07T09:00', 'Asia/Singapore')).toBe(at);
    expect(eventWallTimeInstant('2027-01-07T09:00', 'America/New_York')).toBe('2027-01-07T14:00:00.000Z');
  });
  it.each(['soon', '2027-02-30T09:00', '2027-01-07T24:00', '2027-01-07T09:60', '2027-01-07T09:00Textra'])('refuses malformed wall time %s', (input) => {
    expect(() => eventWallTimeInstant(input, TEST_EVENT.timezone)).toThrow(/event clock/);
  });
  it('follows the documented DST gap and overlap rules', () => {
    expect(eventWallTimeInstant('2027-03-14T02:30', 'America/New_York')).toBe('2027-03-14T07:00:00.000Z');
    expect(eventWallTimeInstant('2027-11-07T01:30', 'America/New_York')).toBe('2027-11-07T05:30:00.000Z');
  });
});

describe('correction selection and voiding', () => {
  it('selects a recent record at a station, pages older rows and requires a reason and confirmation', async () => {
    mockApi.mockImplementation(async (path) => stations(String(path)) ?? (String(path).includes('/recent?')
      ? { data: [String(path).includes('cursor=') ? { ...registration, id: 'reg-older' } : registration], meta: { count: 1, nextCursor: String(path).includes('cursor=') ? null : 'reg-1' } }
      : undefined));
    show(<VoidRecordForm />);
    await screen.findByRole('option', { name: 'Hall' });
    expect(screen.getByRole('button', { name: 'Void record' })).toHaveProperty('disabled', true);
    expect(mockApi.mock.calls.some(([path]) => String(path).includes('/recent?'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Find a recent record at'), { target: { value: 'hall' } });
    fireEvent.click(await screen.findByRole('button', { name: /Sec 1 · APP/ }));
    expect(screen.getByLabelText('Selected record ID')).toHaveProperty('value', registration.id);
    fireEvent.click(screen.getByRole('button', { name: 'Load older counting records' }));
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('cursor=reg-1')));
    fireEvent.click(screen.getByLabelText(/I checked the record ID/));
    fireEvent.click(screen.getByRole('button', { name: 'Void record' }));
    expect(mockApi.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Duplicate tap confirmed against the paper sheet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Void record' }));
    await screen.findByText(/Correction saved/);
    expect(mockApi).toHaveBeenCalledWith(`${base}/registrations/reg-1/void`, { method: 'POST', body: { reason: 'Duplicate tap confirmed against the paper sheet' } });
  });

  it('clears the selected record when its kind changes and can void a chosen footfall tick', async () => {
    mockApi.mockImplementation(async (path) => stations(String(path)) ?? (String(path).includes('/recent?') ? { data: [footfall], meta: { count: 1, nextCursor: null } } : undefined));
    show(<VoidRecordForm />);
    fireEvent.change(screen.getByLabelText('Selected record ID'), { target: { value: 'old-registration' } });
    fireEvent.click(screen.getByLabelText('Footfall tick'));
    expect(screen.getByLabelText('Selected record ID')).toHaveProperty('value', '');
    await screen.findByRole('option', { name: 'Hall' });
    fireEvent.change(screen.getByLabelText('Find a recent record at'), { target: { value: 'hall' } });
    fireEvent.click(await screen.findByRole('button', { name: /4 room entries/ }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Paper block was entered twice' } });
    fireEvent.click(screen.getByLabelText(/I checked the record ID/));
    fireEvent.click(screen.getByRole('button', { name: 'Void record' }));
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(`${base}/footfall/ticks/tick-1/void`, { method: 'POST', body: { reason: 'Paper block was entered twice' } }));
  });

  it('shows a failed read and a failed void without claiming success', async () => {
    mockApi.mockImplementation(async (path) => {
      const value = stations(String(path));
      if (value) return value;
      if (String(path).includes('/recent?')) throw new ApiError(503, { code: 'UNAVAILABLE', message: 'Recent records unavailable', requestId: 'synthetic-correction-read' });
      throw new ApiError(409, { code: 'CONFLICT', message: 'Record already changed', requestId: 'synthetic-correction-void' });
    });
    show(<VoidRecordForm />);
    await screen.findByRole('option', { name: 'Hall' });
    fireEvent.change(screen.getByLabelText('Find a recent record at'), { target: { value: 'hall' } });
    await screen.findByText('synthetic-correction-read');
    expect(screen.queryByText('Recent records unavailable')).toBeNull();
    fireEvent.change(screen.getByLabelText('Selected record ID'), { target: { value: 'older' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Duplicate in the older audit record' } });
    fireEvent.click(screen.getByLabelText(/I checked the record ID/));
    fireEvent.click(screen.getByRole('button', { name: 'Void record' }));
    await screen.findByText('Record already changed');
    expect(screen.queryByText(/Correction saved/)).toBeNull();
  });
});

describe('paper block corrections', () => {
  function enterBlock() {
    fireEvent.change(screen.getByLabelText('Room or station'), { target: { value: 'hall' } });
    fireEvent.change(screen.getByLabelText('Room entries'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Block start (Asia/Singapore)'), { target: { value: '2027-01-07T09:00' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Clicker sheet for the morning block' } });
  }
  it('converts the event clock, retries with the same receipt, and clears a saved form', async () => {
    let writes = 0;
    mockApi.mockImplementation(async (path) => {
      const value = stations(String(path));
      if (value) return value;
      if (++writes === 1) throw new Error('Connection interrupted');
      return {};
    });
    show(<BulkFootfallForm />);
    await screen.findByRole('option', { name: 'Hall' });
    enterBlock();
    fireEvent.click(screen.getByRole('button', { name: 'Record paper total' }));
    await screen.findByText('This action was not confirmed');
    expect(screen.queryByText('Connection interrupted')).toBeNull();
    expect(screen.getByLabelText('Reason')).toHaveProperty('value', 'Clicker sheet for the morning block');
    fireEvent.click(screen.getByRole('button', { name: 'Record paper total' }));
    await screen.findByText(/Correction saved/);
    const calls = mockApi.mock.calls.filter(([path]) => path === `${base}/footfall/bulk`);
    expect(calls).toHaveLength(2);
    expect(calls[0]![1]?.body).toEqual(calls[1]![1]?.body);
    expect(calls[0]![1]?.body).toMatchObject({ stationId: 'hall', quantity: 12, source: 'PAPER', timeBlockStart: at, rehearsal: false });
    expect(screen.getByLabelText('Room entries')).toHaveProperty('value', '');
  });

  it('refuses missing times and out-of-range totals before a write', async () => {
    mockApi.mockImplementation(async (path) => stations(String(path)));
    show(<BulkFootfallForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Record paper total' }));
    await screen.findByText(/valid date and time/);
    await screen.findByRole('option', { name: 'Hall' });
    enterBlock();
    fireEvent.change(screen.getByLabelText('Room entries'), { target: { value: '5001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record paper total' }));
    expect(mockApi.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
});

describe('correction API validation', () => {
  it('encodes chosen record IDs and validates reasons before sending', async () => {
    mockApi.mockResolvedValue(undefined);
    await voidRecord(TEST_EVENT.id, { kind: 'footfall', recordId: 'a/b', reason: 'duplicate entry' });
    expect(mockApi).toHaveBeenCalledWith(`${base}/footfall/ticks/a%2Fb/void`, expect.anything());
    expect(() => voidRecord(TEST_EVENT.id, { kind: 'registration', recordId: 'a', reason: '' })).toThrow();
    expect(() => recordBulkFootfall(TEST_EVENT.id, { quantity: 0 } as never)).toThrow();
  });
  it('parses both record kinds and sends explicit practice mode and a cursor', async () => {
    mockApi.mockResolvedValueOnce({ data: [registration], meta: { count: 1, nextCursor: null } });
    await recentCorrectionRecords(TEST_EVENT.id, { kind: 'registration', stationId: 'hall', rehearsal: true, cursor: 'previous' });
    expect(mockApi).toHaveBeenLastCalledWith(`${base}/registrations/recent?stationId=hall&rehearsal=true&limit=50&cursor=previous`);
    mockApi.mockResolvedValueOnce({ data: [footfall], meta: { count: 1, nextCursor: null } });
    expect((await recentCorrectionRecords(TEST_EVENT.id, { kind: 'footfall', stationId: 'hall', rehearsal: false })).data).toHaveLength(1);
  });
});
