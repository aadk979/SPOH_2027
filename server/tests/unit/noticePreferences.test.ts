import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTICE_PREFERENCE } from '@spoh/shared';
import { readNoticePreference, updateNoticePreference } from '../../src/modules/notification/application/noticePreferences.js';
import { UnauthenticatedError } from '../../src/platform/errors/index.js';
import { fixedClock } from '../../src/platform/time/index.js';

const ports = vi.hoisted(() => ({ noticePreferenceOwner: vi.fn(), lockNoticePreferenceOwner: vi.fn(),
  noticePreference: vi.fn(), saveNoticePreference: vi.fn(), writeAudit: vi.fn() }));
const database = vi.hoisted(() => ({ tx: {}, prisma: {}, transaction: vi.fn() }));
vi.mock('../../src/platform/db/client.js', () => ({ prisma: Object.assign(database.prisma, { $transaction: database.transaction }) }));
vi.mock('../../src/modules/notification/data/noticePreferenceRepo.js', () => ports);
vi.mock('../../src/modules/notification/data/noticeStandingRepo.js', () => ({ noticePreference: ports.noticePreference }));
vi.mock('../../src/platform/audit/index.js', () => ({ writeAudit: ports.writeAudit }));

const now = new Date('2027-01-07T03:00:00Z');
const stored = { personId: 'person', urgentPush: true, operationalPush: false, updatedAt: now };
const actor = { personId: 'person', audit: { actorId: 'person', actorSub: 'synthetic-sub',
  actorType: 'PERSON' as const, eventId: null, membershipId: null, requestId: null, ip: null,
  userAgent: null }, clock: fixedClock(now) };

beforeEach(() => {
  vi.resetAllMocks();
  database.transaction.mockImplementation(async (callback: (tx: object) => unknown) => callback(database.tx));
  ports.noticePreferenceOwner.mockResolvedValue({ id: 'person' });
  ports.lockNoticePreferenceOwner.mockResolvedValue({ id: 'person' });
  ports.noticePreference.mockResolvedValue(null);
  ports.saveNoticePreference.mockImplementation(async (_tx, input) => ({ ...input.body, updatedAt: input.now }));
});

describe('person-owned push preferences', () => {
  it('returns the conservative default without creating a preference or an audit', async () => {
    expect(await readNoticePreference('person')).toEqual({ data: DEFAULT_NOTICE_PREFERENCE });
    expect(ports.noticePreferenceOwner).toHaveBeenCalledWith(database.prisma, 'person');
    expect(ports.saveNoticePreference).not.toHaveBeenCalled(); expect(ports.writeAudit).not.toHaveBeenCalled();
  });

  it('returns only current preference flags and the timestamp from the stored row', async () => {
    ports.noticePreference.mockResolvedValue(stored);
    expect(await readNoticePreference('person')).toEqual({ data: { urgentPush: true, operationalPush: false,
      updatedAt: now.toISOString() } });
  });

  it('withholds preferences after identity is deactivated or missing', async () => {
    ports.noticePreferenceOwner.mockResolvedValue(null);
    await expect(readNoticePreference('person')).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(ports.noticePreference).not.toHaveBeenCalled();
  });

  it('rechecks identity under the owner lock before any write or private read', async () => {
    ports.lockNoticePreferenceOwner.mockResolvedValue(null);
    await expect(updateNoticePreference({ urgentPush: false, operationalPush: true }, actor))
      .rejects.toBeInstanceOf(UnauthenticatedError);
    expect(ports.noticePreference).not.toHaveBeenCalled(); expect(ports.saveNoticePreference).not.toHaveBeenCalled();
    expect(ports.writeAudit).not.toHaveBeenCalled();
  });

  it.each([null, stored])('does not invent a change, timestamp or audit for an unchanged preference', async (existing) => {
    ports.noticePreference.mockResolvedValue(existing);
    expect(await updateNoticePreference({ urgentPush: true, operationalPush: false }, actor)).toEqual({ data: {
      urgentPush: true, operationalPush: false, updatedAt: existing ? now.toISOString() : null,
    } });
    expect(ports.saveNoticePreference).not.toHaveBeenCalled(); expect(ports.writeAudit).not.toHaveBeenCalled();
  });

  it.each([
    { urgentPush: false, operationalPush: false },
    { urgentPush: true, operationalPush: true },
  ])('stores and audits either changed flag in the same owner transaction', async (body) => {
    ports.noticePreference.mockResolvedValue(stored);
    expect(await updateNoticePreference(body, actor)).toEqual({ data: { ...body, updatedAt: now.toISOString() } });
    expect(ports.saveNoticePreference).toHaveBeenCalledExactlyOnceWith(database.tx, { personId: 'person', body, now });
    expect(ports.writeAudit).toHaveBeenCalledExactlyOnceWith(database.tx, { ...actor.audit,
      action: 'notification.preference', entityType: 'Person', entityId: 'person',
      before: { urgentPush: true, operationalPush: false }, after: body });
    expect(ports.lockNoticePreferenceOwner.mock.invocationCallOrder[0]).toBeLessThan(ports.saveNoticePreference.mock.invocationCallOrder[0]!);
  });

  it('uses the current default only as the before value of a first explicit opt-in', async () => {
    const body = { urgentPush: false, operationalPush: true };
    await updateNoticePreference(body, { ...actor, clock: undefined });
    expect(ports.writeAudit.mock.calls[0]![1].before).toEqual({ urgentPush: true, operationalPush: false });
    expect(ports.saveNoticePreference.mock.calls[0]![1].now).toBeInstanceOf(Date);
  });

  it('does not acknowledge a preference change if its atomic audit fails', async () => {
    const failure = new Error('synthetic audit outage'); ports.writeAudit.mockRejectedValue(failure);
    await expect(updateNoticePreference({ urgentPush: false, operationalPush: true }, actor)).rejects.toBe(failure);
    expect(ports.saveNoticePreference).toHaveBeenCalledOnce(); expect(database.transaction).toHaveBeenCalledOnce();
  });
});
