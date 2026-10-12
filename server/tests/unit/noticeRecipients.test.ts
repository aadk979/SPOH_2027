import { describe, expect, it, vi } from 'vitest';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { activeNoticeAudience, archiveNoticeRecipients, noticeRecipients } from '../../src/modules/notification/data/noticeRecipientRepo.js';

const scope = { eventId: 'owned-event' };
const preference = { personId: 'active-person', urgentPush: true, operationalPush: false,
  updatedAt: new Date('2027-01-07T03:00:00Z') };

function fixture() {
  let active = 0;
  const sequence: string[] = [];
  const query = <T>(name: string, result: T) => vi.fn(async (_input: unknown) => {
    active += 1;
    expect(active, `overlapping ${name} query`).toBe(1);
    sequence.push(name);
    await Promise.resolve();
    active -= 1;
    return result;
  });
  const members = [
    { id: 'active-member', personId: 'active-person', status: 'ACTIVE' },
    { id: 'invited-member', personId: 'invited-person', status: 'INVITED' },
  ];
  const subscriptions = Array.from({ length: 5 }, (_, index) => ({ id: `device-${index}` }));
  const db = {
    event: { findUniqueOrThrow: query('event', { organisationId: 'owning-organisation' }) },
    person: { findMany: query('people', members.map((row) => ({ id: row.personId, pushSubscriptions: subscriptions }))) },
    eventMembership: { findMany: query('members', members) },
    noticePreference: { findMany: query('preferences', [preference]) },
  };
  return { db, tx: db as unknown as PrismaTransactionClient, sequence, members, subscriptions, query };
}

describe('notice recipients on a single transaction connection', () => {
  it('hydrates active and invited recipients sequentially, with a separate five-device allowance for each person', async () => {
    const f = fixture();
    const result = await noticeRecipients(scope, { tx: f.tx, personIds: ['active-person', 'invited-person', 'foreign-person'] });
    expect(result).toEqual([
      { ...f.members[0], person: { noticePreference: preference, pushSubscriptions: f.subscriptions } },
      { ...f.members[1], person: { noticePreference: null, pushSubscriptions: f.subscriptions } },
    ]);
    expect(f.sequence).toEqual(['members', 'preferences', 'people']);
    expect(f.db.eventMembership.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { eventId: scope.eventId, personId: { in: ['active-person', 'invited-person', 'foreign-person'] },
        status: { in: ['ACTIVE', 'INVITED'] }, person: { deactivatedAt: null } },
      select: { id: true, personId: true, status: true },
    });
    expect(f.db.person.findMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: ['active-person', 'invited-person'] } },
      select: { id: true, pushSubscriptions: { select: { id: true }, orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }], take: 5 } } });
    expect(f.db.noticePreference.findMany).toHaveBeenCalledExactlyOnceWith({ where: { personId: { in: ['active-person', 'invited-person'] } } });
    expect(result.flatMap((row) => row.person.pushSubscriptions)).toHaveLength(10);
  });

  it('does not hydrate credentials or preferences when no eligible membership exists', async () => {
    const f = fixture(); f.db.eventMembership.findMany.mockResolvedValue([]);
    expect(await noticeRecipients(scope, { tx: f.tx, personIds: ['inactive-or-foreign'] })).toEqual([]);
    expect(f.db.noticePreference.findMany).not.toHaveBeenCalled();
    expect(f.db.person.findMany).not.toHaveBeenCalled();
  });

  it('preserves owning-platform recipients without event membership and with ended event membership', async () => {
    const f = fixture();
    f.db.person.findMany.mockImplementationOnce(f.query('people', [{ id: 'platform-person', pushSubscriptions: [] }, { id: 'ended-person', pushSubscriptions: [] }]))
      .mockImplementationOnce(f.query('people', ['platform-person', 'ended-person'].map((id) => ({ id, pushSubscriptions: f.subscriptions }))));
    f.db.noticePreference.findMany.mockImplementation(f.query('preferences', ['platform-person', 'ended-person'].map((personId) => ({ ...preference, personId }))));
    f.db.eventMembership.findMany.mockImplementationOnce(f.query('members', [
      { id: 'ended-member', status: 'ENDED', personId: 'ended-person' },
    ]));
    const result = await archiveNoticeRecipients(scope, { tx: f.tx, personIds: ['platform-person', 'ended-person'] });
    expect(result).toEqual([
      { id: 'platform-person', pushSubscriptions: f.subscriptions, noticePreference: { ...preference, personId: 'platform-person' }, eventMemberships: [] },
      { id: 'ended-person', pushSubscriptions: f.subscriptions, noticePreference: { ...preference, personId: 'ended-person' },
        eventMemberships: [{ id: 'ended-member', status: 'ENDED' }] },
    ]);
    expect(f.sequence).toEqual(['event', 'people', 'preferences', 'people', 'members']);
    expect(f.db.person.findMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ['platform-person', 'ended-person'] }, deactivatedAt: null,
        organisationMemberships: { some: { organisationId: 'owning-organisation', role: 'PLATFORM_ADMIN' } } },
      select: { id: true },
    });
    expect(f.db.eventMembership.findMany).toHaveBeenCalledWith({
      where: { eventId: scope.eventId, personId: { in: ['platform-person', 'ended-person'] } }, select: { id: true, status: true, personId: true },
    });
  });

  it('does not hydrate an organisation outsider or a deactivated platform person', async () => {
    const f = fixture(); f.db.person.findMany.mockResolvedValue([]);
    expect(await archiveNoticeRecipients(scope, { tx: f.tx, personIds: ['outsider'] })).toEqual([]);
    expect(f.db.eventMembership.findMany).not.toHaveBeenCalled();
    expect(f.db.noticePreference.findMany).not.toHaveBeenCalled();
    expect(f.db.person.findMany).toHaveBeenCalledOnce();
  });

  it('propagates a hydration outage instead of returning a partial eligible audience', async () => {
    const f = fixture(); const failure = new Error('synthetic preference outage');
    f.db.noticePreference.findMany.mockRejectedValue(failure);
    await expect(noticeRecipients(scope, { tx: f.tx, personIds: ['active-person'] })).rejects.toBe(failure);
    expect(f.db.person.findMany).not.toHaveBeenCalled();
  });
  it('keeps missing preferences and missing devices conservative without dropping an eligible person', async () => {
    const f = fixture(); f.db.noticePreference.findMany.mockResolvedValue([]); f.db.person.findMany.mockResolvedValue([]);
    const rows = await noticeRecipients(scope, { tx: f.tx, personIds: ['active-person', 'invited-person'] });
    expect(rows.map((row) => row.person)).toEqual([{ noticePreference: null, pushSubscriptions: [] }, { noticePreference: null, pushSubscriptions: [] }]);
  });
  it.each([
    [{}, undefined],
    [{ roles: ['IC'] as const }, ['IC']],
    [{ minimumRole: 'DEPUTY_COORDINATOR' as const, excludePersonId: 'author' }, ['ADMIN', 'LEAD', 'CHIEF_COORDINATOR', 'DEPUTY_COORDINATOR']],
  ])('limits active audiences to current scoped standing and explicit role rules %j', async (input, roles) => {
    const f = fixture();
    expect(await activeNoticeAudience(scope, { tx: f.tx, ...input })).toEqual(['active-person', 'invited-person']);
    expect(f.db.eventMembership.findMany).toHaveBeenCalledExactlyOnceWith({ where: { eventId: scope.eventId,
      status: 'ACTIVE', person: { deactivatedAt: null }, ...(roles ? { role: { in: roles } } : {}),
      ...('excludePersonId' in input ? { personId: { not: input.excludePersonId } } : {}) }, select: { personId: true } });
  });
});
