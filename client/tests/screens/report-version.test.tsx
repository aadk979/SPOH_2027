import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReportHeader } from '@/features/reports/components/ReportHeader';
import { CurrentReportControl } from '@/features/reports/components/CurrentReportControl';
import * as eventContext from '@/shared/lib/eventContext';
import { TEST_EVENT } from '../helpers/event';

afterEach(cleanup);
const event = { name: 'Test event', slug: 'test-event', status: 'CLOSED' as const };

it('identifies the frozen final report and its close time', () => {
  render(
    <ReportHeader
      data={{
        event,
        countingNote: 'Counts stay separate.',
        snapshot: {
          id: 'snapshot-id',
          kind: 'FINAL',
          lifecycleVersion: 4,
          createdAt: '2026-10-02T03:00:00.000Z',
        },
      }}
    />,
  );
  expect(screen.getByRole('note', { name: 'Report version' }).textContent).toContain(
    'Frozen final report — closed at 2026-10-02T03:00:00.000Z',
  );
  expect(screen.getByRole('note', { name: 'Report version' }).textContent).toContain(
    'Late sync and later corrections are excluded',
  );
});

it('labels current post-close results separately from the frozen report', () => {
  render(<ReportHeader data={{ event, countingNote: 'Counts stay separate.' }} />);
  expect(screen.getByRole('note', { name: 'Report version' }).textContent).toContain(
    'Current report — includes changes after close',
  );
});

it.each(['CLOSED', 'ARCHIVED'] as const)(
  'allows current reads even before a %s event has a report payload',
  (status) => {
    vi.spyOn(eventContext, 'useEvent').mockReturnValue({ ...TEST_EVENT, status });
    const change = vi.fn();
    render(<CurrentReportControl current={false} onChange={change} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show current data after close' }));
    expect(change).toHaveBeenCalledWith(true);
  },
);

it('keeps the post-close control hidden while capture is open', () => {
  vi.spyOn(eventContext, 'useEvent').mockReturnValue({ ...TEST_EVENT, status: 'LIVE' });
  render(<CurrentReportControl current={false} onChange={vi.fn()} />);
  expect(screen.queryByRole('checkbox')).toBeNull();
});
