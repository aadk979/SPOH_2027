import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NoticeDetail } from '@/features/notification/components/NoticeDetail';
import { NoticePreferences } from '@/features/notification/components/NoticePreferences';
import { noticeDestination } from '@/features/notification/model/noticeDestination';
import type { NoticeRecord } from '@spoh/shared';
import { ApiError } from '@/shared/lib/api';

const fixture = vi.hoisted(() => ({ mark: vi.fn(), save: vi.fn(), detail: {} as Record<string, unknown>, preference: {} as Record<string, unknown> }));
vi.mock('@/features/notification/centreQueries', () => ({
  useNoticeDetail: () => fixture.detail,
  useMarkNoticeRead: () => ({ mutate: fixture.mark, isPending: false, isSuccess: false, error: null }),
  useNoticePreference: () => fixture.preference,
  useSaveNoticePreference: () => ({ mutate: fixture.save, reset: vi.fn(), isPending: false, isSuccess: false, error: null }),
}));
vi.mock('@/features/notification/components/AlertDelivery', () => ({ AlertDelivery: () => <p>Device controls</p> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const record: NoticeRecord = { id: 'notice-owned', eventId: 'event-owned', eventName: 'Synthetic event', eventSlug: 'synthetic',
  kind: 'ANNOUNCEMENT_PUBLISHED', priority: 'URGENT', title: 'Announcement', summary: 'Current message', detail: 'Private current body',
  createdAt: '2030-03-04T01:00:00Z', readAt: null,
  destination: { type: 'entity', target: { kind: 'announcement', id: 'source-owned' } },
  acknowledgement: { kind: 'ANNOUNCEMENT', sourceId: 'source-owned', acknowledged: false, canAcknowledge: true } };

it('marks only personal notice state and directs source acknowledgement to the source', () => {
  fixture.detail = { data: { data: record }, isError: false };
  render(<NoticeDetail id={record.id} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
  expect(fixture.mark).toHaveBeenCalledWith(record.id);
  expect(screen.getByRole('link', { name: 'Open source' }).getAttribute('href'))
    .toBe('/e/synthetic/entity?kind=announcement&id=source-owned');
  expect(screen.getByText(/Marking a notice read does not acknowledge/)).toBeDefined();
  expect(screen.queryByRole('button', { name: /acknowledge/i })).toBeNull();
});
it('hides cached private detail and source links after a current authority refusal', () => {
  fixture.detail = { data: { data: record }, isError: false };
  const { rerender } = render(<NoticeDetail id={record.id} />);
  fixture.detail = { data: { data: record }, isError: true,
    error: new ApiError(403, { code: 'FORBIDDEN', message: 'Current access denied', requestId: 'safe-request' }) };
  rerender(<NoticeDetail id={record.id} />);
  expect(screen.queryByText('Private current body')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Open source' })).toBeNull();
});
it('keeps platform notices outside the event membership route', () => {
  expect(noticeDestination({ ...record, destination: { type: 'platform', path: '/events', eventId: record.eventId } }))
    .toBe('/events?eventId=event-owned');
  expect(noticeDestination({ ...record, destination: null })).toBeNull();
});
it('shows default urgent-only preference and saves an explicit operational opt-in', () => {
  fixture.preference = { data: { urgentPush: true, operationalPush: false, updatedAt: null }, isError: false };
  render(<NoticePreferences />);
  const urgent = screen.getByRole('checkbox', { name: 'Urgent push alerts' }) as HTMLInputElement;
  const operational = screen.getByRole('checkbox', { name: 'Operational push alerts' }) as HTMLInputElement;
  expect(urgent.checked).toBe(true); expect(operational.checked).toBe(false);
  fireEvent.click(operational);
  fireEvent.click(screen.getByRole('button', { name: 'Save push preferences' }));
  expect(fixture.save).toHaveBeenCalledWith({ urgentPush: true, operationalPush: true });
  expect(screen.getByText(/Notices remain in your notification centre/)).toBeDefined();
});
