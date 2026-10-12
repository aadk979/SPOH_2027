import { beforeEach, expect, it, vi } from 'vitest';
import { ListNoticesQuery, NoticeRecord } from '@spoh/shared';
import { readNoticeCentre } from '../../src/modules/notification/application/readCentre.js';
import { projectNotice } from '../../src/modules/notification/application/noticeProjection.js';
import { noticeCandidates, type OwnedNotice } from '../../src/modules/notification/data/noticeCentreRepo.js';
import { currentNoticeEvents } from '../../src/modules/notification/data/noticeStandingRepo.js';
import type { NoticeSourceReaders } from '../../src/platform/notification/sourceReader.js';
import { ServiceUnavailableError } from '../../src/platform/errors/index.js';
import { fixedClock } from '../../src/platform/time/index.js';

vi.mock('../../src/platform/db/client.js', () => ({ prisma: {} }));
vi.mock('../../src/modules/notification/data/noticeStandingRepo.js', () => ({ currentNoticeEvents: vi.fn() }));
vi.mock('../../src/modules/notification/data/noticeCentreRepo.js', () => ({
  noticeCandidates: vi.fn(), ownNoticeAnchor: vi.fn(), ownNotice: vi.fn(),
}));
vi.mock('../../src/modules/notification/application/noticeProjection.js', () => ({ projectNotice: vi.fn() }));

const now = new Date('2027-01-07T03:30:00.000Z');
const readers = {} as NoticeSourceReaders;
const reader = { personId: 'person', sourceReaders: readers, clock: fixedClock(now) };
const query = ListNoticesQuery.parse({ limit: 1 });
const row = (id: string): OwnedNotice => ({ id, eventId: 'event', recipientPersonId: 'person',
  recipientMembershipId: 'membership', kind: 'INCIDENT_RAISED', priority: 'URGENT', sourceKind: 'INCIDENT',
  sourceId: `gone-${id}`, transitionKey: `incident:gone-${id}:raised`, context: { type: 'incident' },
  createdAt: now, expiresAt: null, readAt: null });
const visible = NoticeRecord.parse({ id: 'notice', eventId: 'event', eventName: 'Synthetic event', eventSlug: 'synthetic',
  kind: 'INCIDENT_RAISED', priority: 'URGENT', createdAt: now.toISOString(), readAt: null,
  title: 'Current incident', summary: 'Open the incident.', detail: null, destination: null, acknowledgement: null });

beforeEach(() => {
  vi.mocked(currentNoticeEvents).mockReset().mockResolvedValue([{ id: 'event' }]);
  vi.mocked(noticeCandidates).mockReset(); vi.mocked(projectNotice).mockReset();
});

it('bounds hidden-source work and shares exact projections between page and unread scans while preserving the last-scanned cursor', async () => {
  const rows = Array.from({ length: 501 }, (_, index) => row(`hidden-${String(500 - index).padStart(4, '0')}`));
  vi.mocked(noticeCandidates).mockResolvedValue(rows);
  let active = 0; let maximum = 0;
  vi.mocked(projectNotice).mockImplementation(async () => {
    active += 1; maximum = Math.max(maximum, active);
    await Promise.resolve(); active -= 1; return null;
  });
  expect(await readNoticeCentre(query, reader)).toEqual({ data: [], meta: { count: 0,
    nextCursor: 'hidden-0001', unreadCount: 0, unreadCountComplete: false, visibilityScanComplete: false } });
  expect(projectNotice).toHaveBeenCalledTimes(500);
  expect(maximum).toBeGreaterThan(1); expect(maximum).toBeLessThanOrEqual(8);
  expect(vi.mocked(projectNotice).mock.calls.every(([input]) => input.sourceReaders === readers)).toBe(true);
});

it('rechecks a previously hidden source in the next request rather than retaining a denial or a visible body', async () => {
  vi.mocked(noticeCandidates).mockResolvedValue([row('notice')]);
  vi.mocked(projectNotice).mockResolvedValueOnce(null).mockResolvedValueOnce(visible).mockResolvedValueOnce(null);
  expect((await readNoticeCentre(query, reader)).data).toEqual([]);
  expect((await readNoticeCentre(query, reader)).data).toEqual([visible]);
  expect((await readNoticeCentre(query, reader)).data).toEqual([]);
  expect(projectNotice).toHaveBeenCalledTimes(3);
});

it('propagates a source authorization failure instead of returning a successful empty page or unread count', async () => {
  vi.mocked(noticeCandidates).mockResolvedValue([row('notice')]);
  const failure = new ServiceUnavailableError('Permissions could not be checked.');
  vi.mocked(projectNotice).mockRejectedValue(failure);
  await expect(readNoticeCentre(query, reader)).rejects.toBe(failure);
});
