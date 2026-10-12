import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadContext } from '../../src/platform/access/currentRead.js';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import type { NoticeSourceInput } from '../../src/platform/notification/sourceReader.js';
import { ServiceUnavailableError } from '../../src/platform/errors/index.js';
import { readLostPersonNoticeSource } from '../../src/modules/lostPerson/application/readNoticeSource.js';
import { readFallbackNoticeSource } from '../../src/modules/fallback/application/readNoticeSource.js';
import { readGiftNoticeSource } from '../../src/modules/gift/application/readNoticeSource.js';
import { readSwapNoticeSource } from '../../src/modules/shift/application/readNoticeSource.js';
import { readAssignmentNoticeSource } from '../../src/modules/assignments/application/readNoticeSource.js';
import { readIncidentNoticeSource } from '../../src/modules/incident/application/readNoticeSource.js';
import { readArchiveNoticeSource } from '../../src/modules/event/application/readNoticeSource.js';
import { readAnnouncementNoticeSource } from '../../src/modules/announcement/application/readNoticeSource.js';

const repos = vi.hoisted(() => ({ lost: vi.fn(), fallback: vi.fn(), fallbackMember: vi.fn(),
  gift: vi.fn(), giftTransition: vi.fn(), swap: vi.fn(), assignment: vi.fn(), incident: vi.fn(),
  archive: vi.fn(), announcement: vi.fn(), event: vi.fn(), recipient: vi.fn(), body: vi.fn() }));
vi.mock('../../src/modules/lostPerson/data/noticeSourceRepo.js', () => ({ lostPersonNoticeMetadata: repos.lost }));
vi.mock('../../src/modules/fallback/data/noticeSourceRepo.js', () => ({ fallbackNoticeMetadata: repos.fallback, fallbackNoticeMember: repos.fallbackMember }));
vi.mock('../../src/modules/gift/data/noticeSourceRepo.js', () => ({ giftNoticeMetadata: repos.gift, giftNoticeTransition: repos.giftTransition }));
vi.mock('../../src/modules/shift/data/noticeSourceRepo.js', () => ({ swapNoticeMetadata: repos.swap }));
vi.mock('../../src/modules/assignments/data/noticeSourceRepo.js', () => ({ assignmentNoticeMetadata: repos.assignment }));
vi.mock('../../src/modules/incident/data/noticeSourceRepo.js', () => ({ incidentNoticeMetadata: repos.incident }));
vi.mock('../../src/modules/event/data/noticeSourceRepo.js', () => ({ archiveNoticeMetadata: repos.archive }));
vi.mock('../../src/modules/announcement/data/noticeSourceRepo.js', () => ({ announcementNoticeMetadata: repos.announcement,
  noticeAnnouncementEvent: repos.event, noticeAnnouncementRecipient: repos.recipient, permittedNoticeAnnouncement: repos.body }));

const now = new Date('2027-01-07T03:00:00Z');
const scope = { eventId: 'event' };
const assignment = { id: 'assignment', volunteerId: 'person', stationId: 'station', shiftId: 'shift', eventDayId: 'day' };
const alert = { id: 'alert', status: 'ACTIVE', rehearsal: false, resolvedAt: null, event: { status: 'LIVE' }, acknowledged: false };
const gift = { id: 'gift', name: 'Badge', active: true, initialStock: 10, lowStockThreshold: 3, remaining: 2 };
const swap = { id: 'swap', requesterId: 'person', targetId: 'other', status: 'APPROVED' };
const incident = { id: 'incident', severity: 'CRITICAL', reportedById: 'other', rehearsal: false };
const announcement = { id: 'announcement', priority: 'OPERATIONAL', targetRole: null, targetStationId: null,
  targetEventDayId: null, requiresAck: false, expiresAt: null };

function notice(overrides: Partial<NoticeSourceInput> = {}): NoticeSourceInput {
  return { noticeId: 'notice', kind: 'LOST_PERSON_RAISED', priority: 'URGENT', source: { kind: 'LOST_PERSON', id: 'alert' },
    transitionKey: 'lostPerson:alert:raised', recipientPersonId: 'person', recipientMembershipId: 'member',
    createdAt: now, expiresAt: null, context: { type: 'lost-person' }, ...overrides };
}
const inputs = {
  lost: notice(),
  fallback: notice({ kind: 'FALLBACK_REMINDER', priority: 'OPERATIONAL', source: { kind: 'FALLBACK', id: 'window' },
    transitionKey: 'fallback:window:remind:1', context: { type: 'fallback', sequence: 1 } }),
  gift: notice({ kind: 'GIFT_LOW_STOCK', priority: 'OPERATIONAL', source: { kind: 'GIFT', id: 'gift' },
    transitionKey: 'gift:gift:low:transition', context: { type: 'gift', rehearsal: false, transitionId: 'transition',
      transitionType: 'REDEMPTION', remaining: 2, threshold: 3 } }),
  swap: notice({ kind: 'SWAP_APPROVED', priority: 'OPERATIONAL', source: { kind: 'SWAP', id: 'swap' },
    transitionKey: 'swap:swap:APPROVED', context: { type: 'swap' } }),
  assignment: notice({ kind: 'ASSIGNMENT_CHANGED', priority: 'OPERATIONAL', source: { kind: 'ASSIGNMENT', id: 'assignment' },
    transitionKey: 'assignment:assignment:change:committed', context: { type: 'assignment', operation: 'MOVED',
      stationId: 'station', shiftId: 'shift', eventDayId: 'day' } }),
  incident: notice({ kind: 'INCIDENT_RAISED', source: { kind: 'INCIDENT', id: 'incident' },
    transitionKey: 'incident:incident:raised', context: { type: 'incident' } }),
  archive: notice({ kind: 'ARCHIVE_REMINDER', priority: 'OPERATIONAL', source: { kind: 'EVENT', id: 'event' },
    transitionKey: 'event:event:archive:7', context: { type: 'event', lifecycleVersion: 7 } }),
  announcement: notice({ kind: 'ANNOUNCEMENT_PUBLISHED', priority: 'OPERATIONAL', source: { kind: 'ANNOUNCEMENT', id: 'announcement' },
    transitionKey: 'announcement:announcement:published', context: { type: 'announcement' } }),
};

/** The application port allows only explicitly named policy questions, never every question. */
function reader(input: { grants?: string[]; membershipId?: string | null } = {}): ReadContext {
  const grants = new Set(input.grants ?? ['Self.Read:Membership:member']);
  const db = { station: { findMany: vi.fn(async () => [{ id: 'station' }]), findFirst: vi.fn(async () => ({ id: 'station' })) } };
  return { scope, personId: 'person', now, db: db as unknown as PrismaTransactionClient,
    ...(input.membershipId === null ? {} : { membershipId: input.membershipId ?? 'member' }),
    canRead: vi.fn(async ({ action, resource }) => grants.has(`${action}:${resource.type}:${resource.id}`)) };
}
beforeEach(() => {
  vi.resetAllMocks();
  repos.lost.mockResolvedValue(alert);
  repos.fallback.mockResolvedValue({ id: 'window', stationId: null, declaredById: 'person' });
  repos.fallbackMember.mockResolvedValue({ role: 'VOLUNTEER' });
  repos.gift.mockResolvedValue(gift); repos.giftTransition.mockResolvedValue(true);
  repos.swap.mockResolvedValue(swap); repos.assignment.mockResolvedValue(assignment); repos.incident.mockResolvedValue(incident);
  repos.archive.mockResolvedValue({ name: 'Synthetic event', status: 'CLOSED', lifecycleVersion: 7 });
  repos.announcement.mockResolvedValue(announcement);
  repos.event.mockResolvedValue({ timezone: 'Asia/Singapore', dayBoundaryMinutes: 0 });
  repos.recipient.mockResolvedValue({ role: 'VOLUNTEER', todaysStationIds: ['station'], todaysEventDayIds: ['day'] });
  repos.body.mockResolvedValue({ body: 'Current approved announcement text.', acknowledged: false });
});
const sources = [
  ['lost-person', readLostPersonNoticeSource, inputs.lost], ['fallback', readFallbackNoticeSource, inputs.fallback],
  ['gift', readGiftNoticeSource, inputs.gift], ['swap', readSwapNoticeSource, inputs.swap],
  ['assignment', readAssignmentNoticeSource, inputs.assignment], ['incident', readIncidentNoticeSource, inputs.incident],
  ['archive', readArchiveNoticeSource, inputs.archive], ['announcement', readAnnouncementNoticeSource, inputs.announcement],
] as const;

describe.each(sources)('%s notice source boundary', (_name, read, record) => {
  it('rejects a borrowed recipient before metadata or permissions are fetched', async () => {
    const current = reader();
    expect(await read(current, { ...record, recipientPersonId: 'borrowed-person' })).toBeNull();
    expect(current.canRead).not.toHaveBeenCalled();
    for (const repo of Object.values(repos)) expect(repo).not.toHaveBeenCalled();
  });
  it('rejects a mismatched stored source context', async () => {
    const context = record.context.type === 'incident' ? { type: 'announcement' as const } : { type: 'incident' as const };
    expect(await read(reader(), { ...record, context })).toBeNull();
    for (const repo of Object.values(repos)) expect(repo).not.toHaveBeenCalled();
  });
  it('hides a source whose current policy question is denied', async () => {
    expect(await read(reader({ grants: [] }), record)).toBeNull();
    expect(repos.body).not.toHaveBeenCalled();
  });
  it('propagates unavailable authority rather than treating it as an empty successful view', async () => {
    const current = reader();
    const failure = new ServiceUnavailableError('Permissions could not be checked.');
    current.canRead = vi.fn(async () => { throw failure; });
    await expect(read(current, record)).rejects.toBe(failure);
    expect(repos.body).not.toHaveBeenCalled();
  });
});

describe('lost-person transitions and acknowledgement authority', () => {
  it('returns only a generic raised notification and asks the exact current acknowledgement question', async () => {
    const current = reader({ grants: ['Self.Read:Membership:member', 'Alert.Ack:LostPersonAlert:alert'] });
    const visible = await readLostPersonNoticeSource(current, inputs.lost);
    expect(visible).toMatchObject({ title: 'Lost-person alert raised', detail: null,
      acknowledgement: { kind: 'LOST_PERSON', sourceId: 'alert', acknowledged: false, canAcknowledge: true },
      destination: { type: 'entity', target: { kind: 'lost-person', id: 'alert' } }, push: { kind: 'lostPerson.raised', priority: 'URGENT' } });
    expect(repos.lost).toHaveBeenCalledWith(scope, { db: current.db, id: 'alert', personId: 'person' });
    expect(current.canRead).toHaveBeenCalledWith({ action: 'Alert.Ack', resource: { type: 'LostPersonAlert', id: 'alert' } });
  });
  it('does not retain acknowledgement capability after it is revoked or already acknowledged', async () => {
    expect((await readLostPersonNoticeSource(reader(), inputs.lost))?.acknowledgement?.canAcknowledge).toBe(false);
    repos.lost.mockResolvedValue({ ...alert, acknowledged: true });
    const current = reader({ grants: ['Self.Read:Membership:member', 'Alert.Ack:LostPersonAlert:alert'] });
    expect((await readLostPersonNoticeSource(current, inputs.lost))?.acknowledgement).toMatchObject({ acknowledged: true, canAcknowledge: false });
    expect(current.canRead).toHaveBeenCalledTimes(1);
  });
  it('shows a resolved transition without an acknowledgement control', async () => {
    repos.lost.mockResolvedValue({ ...alert, status: 'RESOLVED_FOUND', resolvedAt: now });
    const resolved = { ...inputs.lost, kind: 'LOST_PERSON_RESOLVED' as const, transitionKey: 'lostPerson:alert:resolved' };
    expect(await readLostPersonNoticeSource(reader(), resolved)).toMatchObject({ title: 'Lost-person alert resolved',
      acknowledgement: null, push: { kind: 'lostPerson.resolved' } });
  });
  it.each([
    ['missing source', null, inputs.lost],
    ['resolved raised source', { ...alert, status: 'RESOLVED_FOUND' }, inputs.lost],
    ['unresolved resolved source', alert, { ...inputs.lost, kind: 'LOST_PERSON_RESOLVED', transitionKey: 'lostPerson:alert:resolved' }],
    ['foreign transition', alert, { ...inputs.lost, transitionKey: 'lostPerson:other:raised' }],
    ['unsupported transition kind', alert, { ...inputs.lost, kind: 'INCIDENT_RAISED' }],
    ['practice after go-live', { ...alert, rehearsal: true }, inputs.lost],
  ] as const)('hides %s', async (_label, source, record) => {
    repos.lost.mockResolvedValue(source);
    expect(await readLostPersonNoticeSource(reader(), record)).toBeNull();
  });
  it('labels a current rehearsal explicitly and requires a current membership', async () => {
    repos.lost.mockResolvedValue({ ...alert, rehearsal: true, event: { status: 'REHEARSAL' } });
    expect((await readLostPersonNoticeSource(reader(), inputs.lost))?.title).toBe('Rehearsal: Lost-person alert raised');
    expect(await readLostPersonNoticeSource(reader({ membershipId: null }), inputs.lost)).toBeNull();
  });
});

describe('fallback reminders use current recipient and dashboard authority', () => {
  it('keeps the declarer and current coordinators eligible with the exact scoped dashboard question', async () => {
    const current = reader({ grants: ['Dashboard.ReadEvent:Event:event'] });
    expect(await readFallbackNoticeSource(current, inputs.fallback)).toMatchObject({ title: 'A fallback window is still open',
      detail: null, destination: { type: 'entity', target: { kind: 'fallback', id: 'window' } }, push: { kind: 'fallback.reminder' } });
    expect(current.canRead).toHaveBeenCalledWith({ action: 'Dashboard.ReadEvent', resource: { type: 'Event', id: 'event' } });
    repos.fallback.mockResolvedValue({ id: 'window', stationId: 'station', declaredById: 'other' });
    repos.fallbackMember.mockResolvedValue({ role: 'DEPUTY_COORDINATOR' });
    const stationed = reader({ grants: ['Dashboard.ReadStation:Station:station'] });
    expect(await readFallbackNoticeSource(stationed, inputs.fallback)).not.toBeNull();
    expect(stationed.canRead).toHaveBeenCalledWith({ action: 'Dashboard.ReadStation', resource: { type: 'Station', id: 'station' } });
  });
  it.each([null, { role: 'VOLUNTEER' }])('hides reminders from former or unrelated recipients %j', async (member) => {
    repos.fallback.mockResolvedValue({ id: 'window', stationId: null, declaredById: 'other' });
    repos.fallbackMember.mockResolvedValue(member);
    const current = reader({ grants: ['Dashboard.ReadEvent:Event:event'] });
    expect(await readFallbackNoticeSource(current, inputs.fallback)).toBeNull();
    expect(current.canRead).not.toHaveBeenCalled();
  });
  it('does not revive a closed/missing window or a forged reminder sequence', async () => {
    repos.fallback.mockResolvedValue(null);
    expect(await readFallbackNoticeSource(reader(), inputs.fallback)).toBeNull();
    expect(repos.fallbackMember).not.toHaveBeenCalled();
    expect(await readFallbackNoticeSource(reader(), { ...inputs.fallback, transitionKey: 'fallback:window:remind:2' })).toBeNull();
    expect(await readFallbackNoticeSource(reader({ membershipId: null }), inputs.fallback)).toBeNull();
    expect(await readFallbackNoticeSource(reader(), { ...inputs.fallback, kind: 'INCIDENT_RAISED' })).toBeNull();
  });
});

describe('gift low-stock reminders prove both visibility and their retained transition', () => {
  const current = () => reader({ grants: ['Dashboard.ReadStation:Station:station'] });
  it('uses current live stock and the exact source transition instead of the historical remaining value', async () => {
    const visible = await readGiftNoticeSource(current(), inputs.gift);
    expect(visible).toMatchObject({ title: 'Badge is running low', summary: '2 left. Check stock and brief the gift desk.',
      detail: null, destination: { type: 'entity', target: { kind: 'gift', id: 'gift' } } });
    expect(repos.giftTransition).toHaveBeenCalledWith(scope, expect.objectContaining({ giftId: 'gift', id: 'transition', type: 'REDEMPTION' }));
  });
  it.each([null, { ...gift, active: false }, { ...gift, remaining: 4 }])('hides missing, inactive or replenished stock %j', async (source) => {
    repos.gift.mockResolvedValue(source);
    expect(await readGiftNoticeSource(current(), inputs.gift)).toBeNull();
  });
  it('hides a removed/voided transition without fetching stock and accepts a proved live adjustment', async () => {
    repos.giftTransition.mockResolvedValue(false);
    expect(await readGiftNoticeSource(current(), inputs.gift)).toBeNull();
    expect(repos.gift).not.toHaveBeenCalled();
    repos.giftTransition.mockResolvedValue(true);
    const adjusted = { ...inputs.gift, context: { ...inputs.gift.context as Extract<NoticeSourceInput['context'], { type: 'gift' }>, transitionType: 'ADJUSTMENT' as const } };
    expect(await readGiftNoticeSource(current(), adjusted)).not.toBeNull();
    expect(repos.giftTransition).toHaveBeenLastCalledWith(scope, expect.objectContaining({ type: 'ADJUSTMENT' }));
  });
  it('rejects practice, incorrect kind and mismatched transition notices before stock queries', async () => {
    const context = inputs.gift.context as Extract<NoticeSourceInput['context'], { type: 'gift' }>;
    for (const record of [{ ...inputs.gift, context: { ...context, rehearsal: true } },
      { ...inputs.gift, kind: 'INCIDENT_RAISED' as const }, { ...inputs.gift, transitionKey: 'gift:other:low:transition' }]) {
      expect(await readGiftNoticeSource(current(), record)).toBeNull();
    }
    expect(repos.giftTransition).not.toHaveBeenCalled();
  });
});

describe('swap decisions stay with current participants and current state', () => {
  it.each(['APPROVED', 'REJECTED', 'CANCELLED'] as const)('projects the current %s decision for the target as well as requester', async (status) => {
    repos.swap.mockResolvedValue({ ...swap, requesterId: 'other', targetId: 'person', status });
    const kind = `SWAP_${status}` as NoticeSourceInput['kind'];
    expect(await readSwapNoticeSource(reader(), { ...inputs.swap, kind, transitionKey: `swap:swap:${status}` }))
      .toMatchObject({ title: `Swap ${status.toLowerCase()}`, detail: null, destination: { type: 'action', path: '/swaps' } });
  });
  it.each([null, { ...swap, requesterId: 'other', targetId: 'unrelated' }, { ...swap, status: 'REQUESTED' }])('hides absent, unrelated or stale decisions %j', async (source) => {
    repos.swap.mockResolvedValue(source);
    expect(await readSwapNoticeSource(reader(), inputs.swap)).toBeNull();
  });
  it('does not accept another transition key or an account without current membership', async () => {
    expect(await readSwapNoticeSource(reader(), { ...inputs.swap, transitionKey: 'swap:other:APPROVED' })).toBeNull();
    expect(await readSwapNoticeSource(reader({ membershipId: null }), inputs.swap)).toBeNull();
  });
});

describe('assignment notices never unlock a former or reassigned station', () => {
  it('links only an exact own current assignment', async () => {
    expect((await readAssignmentNoticeSource(reader(), inputs.assignment))?.destination)
      .toEqual({ type: 'entity', target: { kind: 'assignment', id: 'assignment' } });
  });
  it.each([null, { ...assignment, volunteerId: 'other' }, { ...assignment, stationId: 'former' },
    { ...assignment, shiftId: 'former' }, { ...assignment, eventDayId: 'former' }])('uses My shift rather than disclosing a stale assignment %j', async (source) => {
    repos.assignment.mockResolvedValue(source);
    expect((await readAssignmentNoticeSource(reader(), inputs.assignment))?.destination).toEqual({ type: 'action', path: '/shift' });
  });
  it('requires removed operation and absent source before showing retained removal metadata', async () => {
    const context = inputs.assignment.context as Extract<NoticeSourceInput['context'], { type: 'assignment' }>;
    const removed = { ...inputs.assignment, kind: 'ASSIGNMENT_REMOVED' as const, context: { ...context, operation: 'REMOVED' as const } };
    expect(await readAssignmentNoticeSource(reader(), removed)).toBeNull();
    repos.assignment.mockResolvedValue(null);
    expect(await readAssignmentNoticeSource(reader(), removed)).toMatchObject({ title: 'Assignment removed', detail: null,
      destination: { type: 'action', path: '/shift' } });
    expect(await readAssignmentNoticeSource(reader(), { ...removed, context })).toBeNull();
    expect(await readAssignmentNoticeSource(reader(), { ...inputs.assignment, context: removed.context })).toBeNull();
  });
  it('rejects incorrect kind/key and absent current membership', async () => {
    expect(await readAssignmentNoticeSource(reader(), { ...inputs.assignment, kind: 'INCIDENT_RAISED' })).toBeNull();
    expect(await readAssignmentNoticeSource(reader(), { ...inputs.assignment, transitionKey: 'assignment:other:change:committed' })).toBeNull();
    expect(await readAssignmentNoticeSource(reader({ membershipId: null }), inputs.assignment)).toBeNull();
  });
});

describe('incident notices respect current read authority and the severe safety chain', () => {
  const current = () => reader({ grants: ['Incident.Read:Incident:incident'] });
  it.each(['HIGH', 'CRITICAL'] as const)('projects only generic %s metadata without descriptions', async (severity) => {
    repos.incident.mockResolvedValue({ ...incident, severity, rehearsal: true });
    const context = current();
    expect(await readIncidentNoticeSource(context, inputs.incident)).toMatchObject({ title: `Rehearsal: ${severity} incident reported`,
      detail: null, push: { kind: 'incident.critical', priority: 'URGENT' } });
    expect(context.canRead).toHaveBeenCalledWith({ action: 'Incident.Read', resource: { type: 'Incident', id: 'incident' } });
  });
  it.each([null, { ...incident, severity: 'LOW' }, { ...incident, severity: 'MEDIUM' }, { ...incident, reportedById: 'person' }])('hides missing, nonsevere and own reports %j', async (source) => {
    repos.incident.mockResolvedValue(source);
    expect(await readIncidentNoticeSource(current(), inputs.incident)).toBeNull();
  });
  it('rejects incorrect kind/key and labels live reports without a rehearsal prefix', async () => {
    expect(await readIncidentNoticeSource(current(), { ...inputs.incident, kind: 'LOST_PERSON_RAISED' })).toBeNull();
    expect(await readIncidentNoticeSource(current(), { ...inputs.incident, transitionKey: 'incident:other:raised' })).toBeNull();
    expect((await readIncidentNoticeSource(current(), inputs.incident))?.title).toBe('CRITICAL incident reported');
  });
});

describe('archive reminder follows the exact close and organisation authority', () => {
  const current = (membershipId: string | null = 'member') => reader({ membershipId, grants: ['Platform.AdministerEvent:Event:event'] });
  it('uses person authority and a platform destination when no event membership exists', async () => {
    const context = current(null);
    expect((await readArchiveNoticeSource(context, inputs.archive))?.destination).toEqual({ type: 'platform', path: '/events', eventId: 'event' });
    expect(context.canRead).toHaveBeenCalledWith({ action: 'Platform.AdministerEvent', asPerson: true, resource: { type: 'Event', id: 'event' } });
    expect((await readArchiveNoticeSource(current(), inputs.archive))?.destination).toEqual({ type: 'action', path: '/admin/close-out' });
  });
  it.each([null, { name: 'Event', status: 'LIVE', lifecycleVersion: 7 },
    { name: 'Event', status: 'ARCHIVED', lifecycleVersion: 7 }, { name: 'Event', status: 'CLOSED', lifecycleVersion: 8 }])('hides absent, reopened, archived and superseded closes %j', async (source) => {
    repos.archive.mockResolvedValue(source);
    expect(await readArchiveNoticeSource(current(), inputs.archive)).toBeNull();
  });
  it('rejects incorrect kind, event identity or transition before loading lifecycle metadata', async () => {
    for (const record of [{ ...inputs.archive, kind: 'INCIDENT_RAISED' as const },
      { ...inputs.archive, source: { kind: 'EVENT' as const, id: 'other-event' } },
      { ...inputs.archive, transitionKey: 'event:event:archive:8' }]) {
      expect(await readArchiveNoticeSource(current(), record)).toBeNull();
    }
    expect(repos.archive).not.toHaveBeenCalled();
  });
});

describe('announcement body waits for current audience and source visibility', () => {
  it('reads an exact current recipient and message only after membership and audience checks', async () => {
    repos.announcement.mockResolvedValue({ ...announcement, targetRole: 'VOLUNTEER', targetStationId: 'station', targetEventDayId: 'day', requiresAck: true });
    const current = reader({ grants: ['Self.Read:Membership:member', 'Announcement.Ack:Announcement:announcement'] });
    expect(await readAnnouncementNoticeSource(current, inputs.announcement)).toMatchObject({ title: 'Announcement',
      detail: 'Current approved announcement text.', acknowledgement: { acknowledged: false, canAcknowledge: true },
      push: { kind: 'announcement.operational' } });
    expect(repos.body).toHaveBeenCalledWith(scope, { db: current.db, id: 'announcement', personId: 'person',
      today: new Date('2027-01-07T00:00:00.000Z'), now, audience: { role: 'VOLUNTEER', stationId: 'station', eventDayId: 'day' } });
    expect(current.canRead).toHaveBeenCalledWith({ action: 'Announcement.Ack', resource: { type: 'Announcement', id: 'announcement' } });
  });
  it.each([null, { ...announcement, priority: 'URGENT' }, { ...announcement, expiresAt: now },
    { ...announcement, expiresAt: new Date(now.getTime() - 1) }])('does not fetch message text for absent, stale-priority or expired metadata %j', async (source) => {
    repos.announcement.mockResolvedValue(source);
    expect(await readAnnouncementNoticeSource(reader(), inputs.announcement)).toBeNull();
    expect(repos.recipient).not.toHaveBeenCalled(); expect(repos.body).not.toHaveBeenCalled();
  });
  it.each([null, { role: 'IC', todaysStationIds: ['station'], todaysEventDayIds: ['day'] },
    { role: 'VOLUNTEER', todaysStationIds: ['other'], todaysEventDayIds: ['day'] },
    { role: 'VOLUNTEER', todaysStationIds: ['station'], todaysEventDayIds: ['other'] }])('does not fetch a private body for an absent or moved audience recipient %j', async (recipient) => {
    repos.announcement.mockResolvedValue({ ...announcement, targetRole: 'VOLUNTEER', targetStationId: 'station', targetEventDayId: 'day' });
    repos.recipient.mockResolvedValue(recipient);
    expect(await readAnnouncementNoticeSource(reader(), inputs.announcement)).toBeNull();
    expect(repos.body).not.toHaveBeenCalled();
  });
  it('does not resurrect a body whose final recipient read lost authority', async () => {
    repos.body.mockResolvedValue(null);
    expect(await readAnnouncementNoticeSource(reader(), inputs.announcement)).toBeNull();
  });
  it('does not retain acknowledgement capability and avoids another device push for urgent history', async () => {
    repos.announcement.mockResolvedValue({ ...announcement, priority: 'URGENT', requiresAck: true, expiresAt: new Date(now.getTime() + 1) });
    const urgent = { ...inputs.announcement, priority: 'URGENT' as const };
    expect(await readAnnouncementNoticeSource(reader(), urgent)).toMatchObject({ acknowledgement: { canAcknowledge: false }, push: null });
    repos.body.mockResolvedValue({ body: 'Current text', acknowledged: true });
    const current = reader({ grants: ['Self.Read:Membership:member', 'Announcement.Ack:Announcement:announcement'] });
    expect((await readAnnouncementNoticeSource(current, urgent))?.acknowledgement).toMatchObject({ acknowledged: true, canAcknowledge: false });
    expect(current.canRead).toHaveBeenCalledTimes(1);
  });
  it('rejects incorrect kind, transition and absent current membership', async () => {
    expect(await readAnnouncementNoticeSource(reader(), { ...inputs.announcement, kind: 'INCIDENT_RAISED' })).toBeNull();
    expect(await readAnnouncementNoticeSource(reader(), { ...inputs.announcement, transitionKey: 'announcement:other:published' })).toBeNull();
    expect(await readAnnouncementNoticeSource(reader({ membershipId: null }), inputs.announcement)).toBeNull();
  });
});
