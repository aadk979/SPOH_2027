import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FallbackWindowRecord, ImportResponse } from '@spoh/shared';
import { useImportForm } from '@/features/fallback/hooks/useImportForm';
import { ImportSourceForm } from '@/features/fallback/components/ImportSourceForm';
import { ImportPreview } from '@/features/fallback/components/ImportPreview';
import { ImportResult } from '@/features/fallback/components/ImportResult';
import { importFallback, listFallbackWindows } from '@/features/fallback/api';
import * as eventContext from '@/shared/lib/eventContext';
import { TEST_EVENT } from '../helpers/event';

vi.mock('@/features/fallback/api', () => ({
  importFallback: vi.fn(),
  listFallbackWindows: vi.fn(),
}));
vi.mock('@/features/session', () => ({
  useEventTime: () => ({ dateTime: (iso: string) => iso }),
}));

const clients: QueryClient[] = [];
const window = (id: string, rehearsal: boolean, tier = 3): FallbackWindowRecord => ({
  id,
  rehearsal,
  tier,
  startedAt: '2027-01-07T02:00:00Z',
  endedAt: '2027-01-07T03:00:00Z',
  stationId: null,
  stationName: null,
  declaredById: 'chief',
  declaredByName: 'Chief',
  reason: 'Fallback drill',
  open: false,
  durationMinutes: 60,
});
const outcome = (rehearsal: boolean, committed = false): ImportResponse => ({
  rehearsal,
  committed,
  source: 'FALLBACK_SHEET',
  rowsRead: 1,
  recordsCreated: 2,
  recordsSkipped: 0,
  issues: [],
  importBatchId: committed ? 'batch' : null,
});
function Form() {
  const form = useImportForm(true);
  return (
    <>
      <ImportSourceForm form={form} />
      <ImportPreview form={form} />
      <ImportResult form={form} />
    </>
  );
}
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <Form />
    </QueryClientProvider>,
  );
}
function fillRows() {
  fireEvent.change(screen.getByLabelText('Rows (CSV)'), {
    target: {
      value: 'category,stationCode,timeBlockStart,count\nSEC_4,BOOTH,2027-01-07T02:00:00Z,2',
    },
  });
}
async function preview() {
  fireEvent.click(screen.getByRole('button', { name: 'Preview — writes nothing' }));
  return screen.findByRole('button', { name: 'Import 2 records as fallback sheet' });
}
beforeEach(() => {
  vi.mocked(listFallbackWindows)
    .mockReset()
    .mockResolvedValue([window('practice', true), window('live', false), window('paper', true, 4)]);
  vi.mocked(importFallback)
    .mockReset()
    .mockImplementation(async (_event, _target, request) =>
      outcome(request.rehearsal ?? false, request.commit),
    );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

it.each([
  ['LIVE', 'practice', true],
  ['REHEARSAL', 'live', false],
] as const)('uses the %s event’s chosen window provenance (%s)', async (status, id, rehearsal) => {
  vi.spyOn(eventContext, 'useEvent').mockReturnValue({ ...TEST_EVENT, status });
  show();
  await screen.findByRole('option', { name: /REHEARSAL · Practice.*Closed/ });
  expect(screen.getAllByRole('option')).toHaveLength(3);
  fireEvent.change(screen.getByLabelText(/Source fallback window/), { target: { value: id } });
  fillRows();
  const commit = await preview();
  expect(vi.mocked(importFallback).mock.calls[0]).toEqual([
    TEST_EVENT.id,
    'registrations',
    expect.objectContaining({ fallbackWindowId: id, rehearsal, commit: false }),
  ]);
  expect(
    screen.getByText(rehearsal ? 'REHEARSAL · Practice import' : 'LIVE · Live import'),
  ).toBeTruthy();
  fireEvent.click(commit);
  await screen.findByText('Imported');
  expect(vi.mocked(importFallback).mock.calls[1]?.[2]).toMatchObject({
    fallbackWindowId: id,
    rehearsal,
    commit: true,
  });
});

it('retains the preview’s practice window when the event goes live', async () => {
  const event = vi.spyOn(eventContext, 'useEvent');
  event.mockReturnValue({ ...TEST_EVENT, status: 'REHEARSAL' });
  const view = show();
  await screen.findByRole('option', { name: /REHEARSAL · Practice.*Closed/ });
  fireEvent.change(screen.getByLabelText(/Source fallback window/), {
    target: { value: 'practice' },
  });
  fillRows();
  const commit = await preview();
  event.mockReturnValue({ ...TEST_EVENT, status: 'LIVE' });
  view.rerender(
    <QueryClientProvider client={clients[0]!}>
      <Form />
    </QueryClientProvider>,
  );
  fireEvent.click(commit);
  await screen.findByText('Imported');
  expect(vi.mocked(importFallback).mock.calls[1]?.[2]).toMatchObject({
    fallbackWindowId: 'practice',
    rehearsal: true,
  });
});

it('clears the chosen window and preview when the source changes', async () => {
  show();
  await screen.findByRole('option', { name: /REHEARSAL · Practice.*Closed/ });
  fireEvent.change(screen.getByLabelText(/Source fallback window/), {
    target: { value: 'practice' },
  });
  fillRows();
  await preview();
  fireEvent.click(screen.getByLabelText('Paper tally'));
  expect((screen.getByLabelText(/Source fallback window/) as HTMLSelectElement).value).toBe('');
  expect(screen.queryByText('This is what would happen')).toBeNull();
  expect(screen.getAllByRole('option')).toHaveLength(2);
});

it.each(['File name', 'Notes'])('requires another preview after editing %s', async (label) => {
  show();
  fillRows();
  await preview();
  fireEvent.change(screen.getByLabelText(new RegExp(label)), {
    target: { value: 'Edited metadata' },
  });
  expect(screen.queryByText('This is what would happen')).toBeNull();
  expect(vi.mocked(importFallback)).toHaveBeenCalledTimes(1);
});

it('holds all editable fields while a preview request is pending', async () => {
  let finish!: (response: ImportResponse) => void;
  vi.mocked(importFallback).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  show();
  fillRows();
  fireEvent.click(screen.getByRole('button', { name: 'Preview — writes nothing' }));
  await waitFor(() => expect(vi.mocked(importFallback)).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('Rows (CSV)').closest('fieldset')?.disabled).toBe(true);
  finish(outcome(false));
  await screen.findByText('This is what would happen');
  expect(screen.getByLabelText('Rows (CSV)').closest('fieldset')?.disabled).toBe(false);
});
