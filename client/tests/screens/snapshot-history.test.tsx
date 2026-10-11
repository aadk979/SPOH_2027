import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SnapshotHistory } from '@/features/reports/components/SnapshotHistory';
const reads = vi.hoisted(() => ({
  allowRead: true,
  allowExport: true,
  report: { data: { total: 23 }, error: null as Error | null, isPending: false },
  list: {
    data: {
      pages: [
        {
          data: [
            {
              id: 'snapshot-a',
              kind: 'FINAL',
              createdAt: 'event clock',
              supersededAt: 'later',
              rehearsalIncluded: true,
            },
          ],
        },
      ],
    },
    isPending: false,
    error: null as Error | null,
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
  read: vi.fn(),
  mutate: vi.fn(),
  downloadError: null as Error | null,
}));
vi.mock('@/features/session', () => ({
  useCurrentSession: () => ({ volunteerId: 'snapshot-reader' }),
  useAllows: () => (action: string) =>
    action === 'Report.Generate' ? reads.allowRead : reads.allowExport,
  useEventTime: () => ({ dateTime: (value: string) => value }),
}));
vi.mock('@/shared/lib/eventContext', () => ({ useEventId: () => 'snapshot-event' }));
vi.mock('@/features/reports/queries', () => ({
  useReportSnapshots: () => reads.list,
  useReportSnapshot: (id: string) => {
    reads.read(id);
    return reads.report;
  },
  useSnapshotDownload: () => ({
    mutate: reads.mutate,
    isPending: false,
    error: reads.downloadError,
  }),
}));
vi.mock('@/features/reports/components/ReportTotals', () => ({
  ReportTotals: () => <p>Frozen total 23</p>,
}));
beforeEach(() => {
  reads.allowRead = true;
  reads.allowExport = true;
  reads.read.mockClear();
  reads.mutate.mockClear();
  reads.list.error = null;
  reads.report.error = null;
  reads.downloadError = null;
  reads.list.data.pages = [
    {
      data: [
        {
          id: 'snapshot-a',
          kind: 'FINAL',
          createdAt: 'event clock',
          supersededAt: 'later',
          rehearsalIncluded: true,
        },
      ],
    },
  ];
});
afterEach(cleanup);
it('opens the selected frozen record and exports that record rather than current totals', () => {
  render(<SnapshotHistory />);
  expect(reads.read).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: /FINAL · event clock · superseded · includes rehearsal/ }),
  );
  expect(reads.read).toHaveBeenCalledWith('snapshot-a');
  expect(screen.getByText('Frozen total 23')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Download frozen XLSX' }));
  expect(reads.mutate).toHaveBeenCalledWith({ id: 'snapshot-a', format: 'xlsx' });
  fireEvent.click(screen.getByRole('button', { name: 'Load older snapshots' }));
  expect(reads.list.fetchNextPage).toHaveBeenCalled();
});
it('requires the generate permission for history and export permission for downloads', () => {
  reads.allowRead = false;
  const view = render(<SnapshotHistory />);
  expect(screen.queryByText('Frozen report history')).toBeNull();
  reads.allowRead = true;
  reads.allowExport = false;
  view.rerender(<SnapshotHistory />);
  fireEvent.click(screen.getByRole('button', { name: /FINAL · event clock/ }));
  expect(screen.queryByRole('button', { name: /Download frozen/ })).toBeNull();
});
it('offers a retry for a failed list without displaying cached empty or record state', () => {
  reads.list.data.pages = [{ data: [] }];
  reads.list.error = new Error('Reports are unavailable.');
  render(<SnapshotHistory />);
  expect(screen.queryByText(/No frozen reports yet/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry history' }));
  expect(reads.list.refetch).toHaveBeenCalled();
});
it('hides a cached selected report and downloads when its refresh fails', () => {
  const view = render(<SnapshotHistory />);
  fireEvent.click(screen.getByRole('button', { name: /FINAL · event clock/ }));
  expect(screen.getByText('Frozen total 23')).toBeTruthy();
  reads.report.error = new Error('The selected report is unavailable.');
  view.rerender(<SnapshotHistory />);
  expect(screen.queryByText('Frozen total 23')).toBeNull();
  expect(screen.queryByRole('button', { name: /Download frozen/ })).toBeNull();
});
it('unmounts the selected private report when the current read permission disappears', () => {
  const view = render(<SnapshotHistory />);
  fireEvent.click(screen.getByRole('button', { name: /FINAL · event clock/ }));
  reads.allowRead = false;
  view.rerender(<SnapshotHistory />);
  expect(screen.queryByText('Frozen total 23')).toBeNull();
  reads.allowRead = true;
  view.rerender(<SnapshotHistory />);
  expect(screen.queryByText('Frozen total 23')).toBeNull();
});
