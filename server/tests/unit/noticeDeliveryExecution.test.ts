import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeNoticeDelivery, deliverNoticeBatch } from '../../src/modules/notification/application/deliverNoticeBatch.js';
import type { NoticeClaim } from '../../src/modules/notification/data/noticeDeliveryRepo.js';
import type { NoticeSourceReaders } from '../../src/platform/notification/sourceReader.js';
import { fixedClock } from '../../src/platform/time/index.js';

const ports = vi.hoisted(() => ({ prepareNoticeDelivery: vi.fn(), finishNoticeDelivery: vi.fn(),
  pruneNoticeDevice: vi.fn(), claimNoticeRows: vi.fn(), sendDevicePush: vi.fn(), logError: vi.fn() }));
const database = vi.hoisted(() => ({ tx: {}, transaction: vi.fn() }));
vi.mock('../../src/platform/db/client.js', () => ({ prisma: { $transaction: database.transaction } }));
vi.mock('../../src/platform/logger/index.js', () => ({ logger: { error: ports.logError } }));
vi.mock('../../src/modules/notification/data/noticeDeliveryRepo.js', () => ports);
vi.mock('../../src/modules/notification/application/prepareNoticeDelivery.js', () => ({ prepareNoticeDelivery: ports.prepareNoticeDelivery }));
vi.mock('../../src/modules/notification/application/sendDevicePush.js', () => ({ sendDevicePush: ports.sendDevicePush }));

const now = new Date('2027-01-07T03:00:00Z');
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
const sourceReaders = {} as NoticeSourceReaders;
const claim: NoticeClaim = { id: 'delivery', eventId: 'event', version: 5, attempts: 1,
  maxAttempts: 5, lockedBy: 'worker', lockedUntil: later(60), exhausted: false };
const device = { id: 'device', volunteerId: 'person', endpoint: 'https://push.example.test/synthetic',
  p256dh: 'synthetic-key', auth: 'synthetic-auth' };
const prepared = () => ({ kind: 'SEND' as const, claim, device, expiresAt: later(300),
  send: { target: { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
    payload: { kind: 'lostPerson.raised' as const, priority: 'URGENT' as const, title: 'Search raised',
      body: 'Open the active alert.', tag: 'lostPerson:alert', url: '/notifications?notice=notice' } } });
const execute = () => executeNoticeDelivery({ claim, clock: fixedClock(now), sourceReaders });

beforeEach(() => {
  vi.resetAllMocks();
  database.transaction.mockImplementation(async (callback: (tx: object) => unknown) => callback(database.tx));
  ports.prepareNoticeDelivery.mockResolvedValue(prepared());
  ports.finishNoticeDelivery.mockImplementation(async (_tx, input) => input.outcome.status);
  ports.sendDevicePush.mockResolvedValue('ACCEPTED');
});

describe('bounded external notice attempts', () => {
  it.each(['SKIPPED', 'STALE', 'DEAD'])('returns admission outcome %s without an external attempt', async (kind) => {
    ports.prepareNoticeDelivery.mockResolvedValue({ kind });
    expect(await execute()).toBe(kind);
    expect(ports.sendDevicePush).not.toHaveBeenCalled(); expect(ports.finishNoticeDelivery).not.toHaveBeenCalled();
    expect(ports.pruneNoticeDevice).not.toHaveBeenCalled();
  });

  it('does not send or settle a claim whose lease expired after admission', async () => {
    expect(await executeNoticeDelivery({ claim, sourceReaders, clock: fixedClock(later(61)) })).toBe('STALE');
    expect(ports.sendDevicePush).not.toHaveBeenCalled(); expect(ports.finishNoticeDelivery).not.toHaveBeenCalled();
  });

  it('refuses a sub-second remaining TTL and settles expiry without calling the provider', async () => {
    ports.prepareNoticeDelivery.mockResolvedValue({ ...prepared(), expiresAt: new Date(now.getTime() + 999) });
    expect(await execute()).toBe('SKIPPED');
    expect(ports.sendDevicePush).not.toHaveBeenCalled();
    expect(ports.finishNoticeDelivery).toHaveBeenCalledExactlyOnceWith(database.tx, {
      claim, now, outcome: { status: 'SKIPPED', lastError: 'EXPIRED' },
    });
  });

  it('sends only current projected content with a bounded TTL and commits the same fenced claim', async () => {
    expect(await execute()).toBe('SENT');
    expect(ports.sendDevicePush).toHaveBeenCalledExactlyOnceWith({ ...prepared().send, ttlSeconds: 300 });
    expect(ports.finishNoticeDelivery).toHaveBeenCalledExactlyOnceWith(database.tx, {
      claim, now, outcome: { status: 'SENT', lastError: null },
    });
    expect(ports.pruneNoticeDevice).not.toHaveBeenCalled();
  });

  it.each([
    ['UNCONFIGURED', 'SKIPPED', 'UNCONFIGURED'],
    ['GONE', 'SKIPPED', 'SUBSCRIPTION_GONE'],
  ])('settles provider outcome %s without retaining provider credentials in the outcome', async (provider, status, error) => {
    ports.sendDevicePush.mockResolvedValue(provider);
    expect(await execute()).toBe(status);
    expect(ports.finishNoticeDelivery.mock.calls[0]![1]).toEqual({
      claim, now, outcome: { status, lastError: error },
    });
    if (provider === 'GONE') expect(ports.pruneNoticeDevice).toHaveBeenCalledExactlyOnceWith(device);
    else expect(ports.pruneNoticeDevice).not.toHaveBeenCalled();
  });

  it('does not prune a device when a competing worker fenced out the gone-device settlement', async () => {
    ports.sendDevicePush.mockResolvedValue('GONE'); ports.finishNoticeDelivery.mockResolvedValue('STALE');
    expect(await execute()).toBe('STALE'); expect(ports.pruneNoticeDevice).not.toHaveBeenCalled();
  });

  it.each([false, true])('retains a retryable failure, including a throwing provider (%s)', async (throws) => {
    if (throws) ports.sendDevicePush.mockRejectedValue(new Error('synthetic provider refusal'));
    else ports.sendDevicePush.mockResolvedValue('FAILED');
    expect(await execute()).toBe('PENDING');
    expect(ports.finishNoticeDelivery.mock.calls[0]![1].outcome).toEqual({
      status: 'PENDING', lastError: 'PUSH_FAILED', runAt: later(30),
    });
    expect(ports.pruneNoticeDevice).not.toHaveBeenCalled();
  });

  it('uses the post-provider clock when a failed attempt reaches the immutable deadline', async () => {
    const timestamps = [now, later(300), later(300)];
    const clock = { now: () => timestamps.shift() ?? later(300) };
    ports.sendDevicePush.mockResolvedValue('FAILED');
    expect(await executeNoticeDelivery({ claim, sourceReaders, clock })).toBe('SKIPPED');
    expect(ports.finishNoticeDelivery.mock.calls[0]![1]).toEqual({ claim, now: later(300),
      outcome: { status: 'SKIPPED', lastError: 'EXPIRED' } });
  });

  it('allows an injected provider without also invoking the default provider', async () => {
    const send = vi.fn().mockResolvedValue('ACCEPTED' as const);
    expect(await executeNoticeDelivery({ claim, sourceReaders, send, clock: fixedClock(now) })).toBe('SENT');
    expect(send).toHaveBeenCalledExactlyOnceWith({ ...prepared().send, ttlSeconds: 300 });
    expect(ports.sendDevicePush).not.toHaveBeenCalled();
  });
});

describe('serial scheduler ownership', () => {
  it('continues after a source outage and logs only the fixed failure code', async () => {
    const other = { ...claim, id: 'second-delivery', eventId: 'second-event' };
    ports.claimNoticeRows.mockResolvedValue([claim, other]);
    ports.prepareNoticeDelivery.mockRejectedValueOnce(new Error('private synthetic source description'))
      .mockResolvedValueOnce({ ...prepared(), claim: other });
    await deliverNoticeBatch({ workerId: 'batch-worker', sourceReaders, clock: fixedClock(now) });
    expect(ports.claimNoticeRows).toHaveBeenCalledExactlyOnceWith(database.tx, {
      workerId: 'batch-worker', now, leaseUntil: later(60),
    });
    expect(ports.prepareNoticeDelivery.mock.calls.map(([input]) => input.claim.id)).toEqual(['delivery', 'second-delivery']);
    expect(ports.sendDevicePush).toHaveBeenCalledOnce();
    expect(ports.finishNoticeDelivery.mock.calls[0]![1].claim).toBe(other);
    expect(ports.logError).toHaveBeenCalledExactlyOnceWith({ code: 'NOTICE_DELIVERY_FAILED' }, 'notification delivery failed');
    expect(JSON.stringify(ports.logError.mock.calls)).not.toContain('private synthetic source');
  });

  it('makes no attempt when the atomic claim returned no due work', async () => {
    ports.claimNoticeRows.mockResolvedValue([]);
    await deliverNoticeBatch({ workerId: 'idle-worker', sourceReaders });
    expect(ports.claimNoticeRows).toHaveBeenCalledOnce();
    expect(ports.prepareNoticeDelivery).not.toHaveBeenCalled(); expect(ports.sendDevicePush).not.toHaveBeenCalled();
  });
});
