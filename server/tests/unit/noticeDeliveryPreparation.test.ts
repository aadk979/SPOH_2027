import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoticeSourceReaders } from '../../src/platform/notification/sourceReader.js';
import type { OwnedNotice } from '../../src/modules/notification/data/noticeCentreRepo.js';
import type { NoticeClaim, lockedNoticeDelivery } from '../../src/modules/notification/data/noticeDeliveryRepo.js';
import type { readNoticeSource } from '../../src/modules/notification/application/noticeSource.js';
import { prepareNoticeDelivery } from '../../src/modules/notification/application/prepareNoticeDelivery.js';
import { fixedClock } from '../../src/platform/time/index.js';

const ports = vi.hoisted(() => ({
  lockedNoticeDelivery: vi.fn(), finishNoticeDelivery: vi.fn(), reserveNoticeSend: vi.fn(),
  noticeDevice: vi.fn(), readNoticeSource: vi.fn(), noticePreference: vi.fn(),
}));
const database = vi.hoisted(() => ({ tx: {}, transaction: vi.fn() }));
vi.mock('../../src/platform/db/client.js', () => ({ prisma: { $transaction: database.transaction } }));
vi.mock('../../src/modules/notification/data/noticeDeliveryRepo.js', () => ports);
vi.mock('../../src/modules/notification/data/noticeStandingRepo.js', () => ({ noticePreference: ports.noticePreference }));
vi.mock('../../src/modules/notification/application/noticeSource.js', () => ({ readNoticeSource: ports.readNoticeSource }));

type Locked = NonNullable<Awaited<ReturnType<typeof lockedNoticeDelivery>>>;
type Visible = NonNullable<Awaited<ReturnType<typeof readNoticeSource>>>;
const now = new Date('2027-01-07T03:00:00Z');
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
const sourceReaders = {} as NoticeSourceReaders;
const claim: NoticeClaim = { id: 'delivery', eventId: 'event', version: 4, attempts: 1,
  maxAttempts: 5, lockedBy: 'worker', lockedUntil: later(60), exhausted: false };
const device = { id: 'device', volunteerId: 'person', endpoint: 'https://push.example.test/synthetic',
  p256dh: 'synthetic-key', auth: 'synthetic-auth' };

function locked(): Locked {
  const notice: OwnedNotice = { id: 'notice', eventId: 'event', recipientPersonId: 'person',
    recipientMembershipId: 'member', kind: 'LOST_PERSON_RAISED', priority: 'URGENT',
    sourceKind: 'LOST_PERSON', sourceId: 'alert', transitionKey: 'lostPerson:alert:raised',
    context: { type: 'lost-person' }, createdAt: now, expiresAt: null, readAt: null };
  return { now, row: { ...claim, noticeId: notice.id, recipientPersonId: 'person', membershipId: 'member',
    subscriptionId: device.id, deviceKey: device.id, status: 'RUNNING', runAt: now,
    expiresAt: later(600), completedAt: null, lastError: null, createdAt: now, notice } };
}
function visible(): Visible {
  return { event: { id: 'event', name: 'Synthetic event', slug: 'synthetic', organisationId: 'organisation',
    status: 'LIVE', memberships: [{ id: 'member', status: 'ACTIVE' }], organisation: { memberships: [] } },
  source: { title: 'Current search', summary: 'Open the active alert.', detail: null,
    destination: null, acknowledgement: null, push: { kind: 'lostPerson.raised', priority: 'URGENT',
      title: 'Current search', body: 'Open the active alert.', tag: 'lostPerson:alert', validUntil: null } } };
}
const prepare = (inputClaim = claim) => prepareNoticeDelivery({ claim: inputClaim,
  clock: fixedClock(now), sourceReaders });

beforeEach(() => {
  vi.resetAllMocks();
  database.transaction.mockImplementation(async (callback: (tx: object) => unknown) => callback(database.tx));
  ports.lockedNoticeDelivery.mockResolvedValue(locked());
  ports.readNoticeSource.mockResolvedValue(visible());
  ports.noticePreference.mockResolvedValue(null);
  ports.noticeDevice.mockResolvedValue(device);
  ports.finishNoticeDelivery.mockImplementation(async (_tx, input) => input.outcome.status);
  ports.reserveNoticeSend.mockImplementation(async (_tx, input) => ({ ...input, version: input.version + 1 }));
});

describe('current delivery admission', () => {
  it('does no source or device work for a stale lease', async () => {
    ports.lockedNoticeDelivery.mockResolvedValue(null);
    expect(await prepare()).toEqual({ kind: 'STALE' });
    expect(ports.readNoticeSource).not.toHaveBeenCalled();
    expect(ports.noticeDevice).not.toHaveBeenCalled();
    expect(ports.finishNoticeDelivery).not.toHaveBeenCalled();
    expect(ports.reserveNoticeSend).not.toHaveBeenCalled();
  });

  it('settles exhausted claims without reading a private source or reserving an external attempt', async () => {
    const exhausted = { ...claim, exhausted: true };
    expect(await prepare(exhausted)).toEqual({ kind: 'DEAD' });
    expect(ports.finishNoticeDelivery).toHaveBeenCalledExactlyOnceWith(database.tx, {
      claim: exhausted, now, outcome: { status: 'DEAD', lastError: 'RETRY_EXHAUSTED' },
    });
    expect(ports.readNoticeSource).not.toHaveBeenCalled();
    expect(ports.reserveNoticeSend).not.toHaveBeenCalled();
  });

  const refusals: Array<[string, string, (record: Locked, source: Visible) => void]> = [
    ['expired immutable deadline', 'EXPIRED', (record) => { record.row.expiresAt = now; }],
    ['different notice recipient', 'RECIPIENT_OUT_OF_SCOPE', (record) => { record.row.notice.recipientPersonId = 'other-person'; }],
    ['archived source event', 'ARCHIVED', (_record, source) => { source.event.status = 'ARCHIVED'; }],
    ['absent current membership', 'RECIPIENT_INACTIVE', (_record, source) => { source.event.memberships = []; }],
    ['different current membership', 'RECIPIENT_INACTIVE', (_record, source) => { source.event.memberships[0]!.id = 'different-member'; }],
    ['invited current membership', 'RECIPIENT_INACTIVE', (_record, source) => { source.event.memberships[0]!.status = 'INVITED'; }],
    ['missing current push projection', 'SOURCE_CHANGED', (_record, source) => { Object.assign(source.source, { push: null }); }],
    ['changed push kind', 'SOURCE_CHANGED', (_record, source) => { Object.assign(source.source.push!, { kind: 'gift.lowStock' }); }],
    ['changed push priority', 'SOURCE_CHANGED', (_record, source) => { Object.assign(source.source.push!, { priority: 'OPERATIONAL' }); }],
    ['expired current source', 'EXPIRED', (_record, source) => { Object.assign(source.source.push!, { validUntil: now }); }],
    ['deleted device reference', 'SUBSCRIPTION_GONE', (record) => { record.row.subscriptionId = null; }],
  ];
  it.each(refusals)('does not reserve a send for %s', async (_name, reason, mutate) => {
    const record = locked(); const source = visible(); mutate(record, source);
    ports.lockedNoticeDelivery.mockResolvedValue(record); ports.readNoticeSource.mockResolvedValue(source);
    expect(await prepare()).toEqual({ kind: 'SKIPPED' });
    expect(ports.finishNoticeDelivery).toHaveBeenCalledExactlyOnceWith(database.tx, {
      claim, now, outcome: { status: 'SKIPPED', lastError: reason },
    });
    expect(ports.reserveNoticeSend).not.toHaveBeenCalled();
    if (reason === 'EXPIRED' && record.row.expiresAt === now || reason === 'RECIPIENT_OUT_OF_SCOPE') {
      expect(ports.readNoticeSource).not.toHaveBeenCalled();
    }
  });

  it('honours an explicit current opt-out before reading source text or device credentials', async () => {
    ports.noticePreference.mockResolvedValue({ urgentPush: false, operationalPush: true });
    expect(await prepare()).toEqual({ kind: 'SKIPPED' });
    expect(ports.finishNoticeDelivery.mock.calls[0]![1].outcome.lastError).toBe('PUSH_DISABLED');
    expect(ports.readNoticeSource).not.toHaveBeenCalled(); expect(ports.noticeDevice).not.toHaveBeenCalled();
    expect(ports.reserveNoticeSend).not.toHaveBeenCalled();
  });

  it('uses the conservative default for a missing operational preference', async () => {
    const record = locked(); record.row.notice.priority = 'OPERATIONAL';
    ports.lockedNoticeDelivery.mockResolvedValue(record);
    expect(await prepare()).toEqual({ kind: 'SKIPPED' });
    expect(ports.finishNoticeDelivery.mock.calls[0]![1].outcome.lastError).toBe('PUSH_DISABLED');
    expect(ports.readNoticeSource).not.toHaveBeenCalled(); expect(ports.reserveNoticeSend).not.toHaveBeenCalled();
  });

  it('settles an unavailable source without loading a device', async () => {
    ports.readNoticeSource.mockResolvedValue(null);
    expect(await prepare()).toEqual({ kind: 'SKIPPED' });
    expect(ports.finishNoticeDelivery.mock.calls[0]![1].outcome.lastError).toBe('SOURCE_UNAVAILABLE');
    expect(ports.noticeDevice).not.toHaveBeenCalled(); expect(ports.reserveNoticeSend).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'SUBSCRIPTION_GONE'],
    [{ ...device, volunteerId: 'new-owner' }, 'SUBSCRIPTION_REASSIGNED'],
  ])('does not disclose or send a removed/reassigned device', async (stored, reason) => {
    ports.noticeDevice.mockResolvedValue(stored);
    expect(await prepare()).toEqual({ kind: 'SKIPPED' });
    expect(ports.finishNoticeDelivery.mock.calls[0]![1].outcome.lastError).toBe(reason);
    expect(ports.reserveNoticeSend).not.toHaveBeenCalled();
  });

  it('reserves the fenced claim only after current admission and caps the source deadline', async () => {
    const source = visible(); Object.assign(source.source.push!, { validUntil: later(90) });
    ports.readNoticeSource.mockResolvedValue(source);
    const result = await prepare();
    expect(result).toMatchObject({ kind: 'SEND', claim: { ...claim, version: 5 }, expiresAt: later(90), device,
      send: { target: { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        payload: { url: '/notifications?notice=notice', title: 'Current search', body: 'Open the active alert.' } } });
    expect(ports.reserveNoticeSend).toHaveBeenCalledExactlyOnceWith(database.tx, claim);
    expect(ports.noticeDevice.mock.invocationCallOrder[0]).toBeLessThan(ports.reserveNoticeSend.mock.invocationCallOrder[0]!);
    expect(ports.finishNoticeDelivery).not.toHaveBeenCalled();
  });

  it('permits the owning-platform archive reminder without event membership and retains the delivery deadline', async () => {
    const record = locked(); record.row.notice.kind = 'ARCHIVE_REMINDER'; record.row.notice.sourceKind = 'EVENT';
    record.row.notice.context = { type: 'event', lifecycleVersion: 7 }; record.row.membershipId = null;
    const source = visible(); source.event.memberships = []; Object.assign(source.source.push!, { kind: 'event.archiveReminder' });
    ports.lockedNoticeDelivery.mockResolvedValue(record); ports.readNoticeSource.mockResolvedValue(source);
    expect(await prepare()).toMatchObject({ kind: 'SEND', expiresAt: later(600) });
    expect(ports.reserveNoticeSend).toHaveBeenCalledOnce();
  });

  it('propagates authority-service failure without classifying it as a completed refusal', async () => {
    const failure = new Error('synthetic authority outage'); ports.readNoticeSource.mockRejectedValue(failure);
    await expect(prepare()).rejects.toBe(failure);
    expect(ports.finishNoticeDelivery).not.toHaveBeenCalled(); expect(ports.reserveNoticeSend).not.toHaveBeenCalled();
    expect(ports.noticeDevice).not.toHaveBeenCalled();
  });
});
