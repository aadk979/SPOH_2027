import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { eventScheduledHandlers } from '../../src/modules/event/index.js';
import { fallbackScheduledHandlers } from '../../src/modules/fallback/index.js';
import { claimDueActions } from '../../src/platform/scheduler/claimDueActions.js';
import { HandlerRegistry } from '../../src/platform/scheduler/registry.js';
import { runClaimedAction } from '../../src/platform/scheduler/runClaimedAction.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createStation, createVolunteer, type TestVolunteer } from '../helpers/fixtures.js';
import {
  scheduledLifecycleFixture,
  type ScheduledLifecycleFixture,
} from '../helpers/scheduledLifecycle.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * P10.7: the reminders ADR-004 §5 catalogues. Both are system actions that only notify;
 * each stops on its own once the state it reminds about has gone.
 */
const at = (minutes: number) => new Date(FROZEN_NOW.getTime() + minutes * 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

async function runDue(registry: HandlerRegistry, instant: Date) {
  const [claim] = await claimDueActions({
    workerId: 'reminder-worker',
    types: registry.types(),
    clock: fixedClock(instant),
  });
  expect(claim).toBeDefined();
  return runClaimedAction({ claim: claim!, registry, clock: fixedClock(instant) });
}

describe('open fallback reminders', () => {
  const registry = new HandlerRegistry(fallbackScheduledHandlers);
  let chief: TestVolunteer;
  const app = createApp();

  beforeEach(async () => {
    await resetDatabase();
    await createStation({ code: 'BOOTH', name: 'Booth' });
    chief = await createVolunteer({ email: 'chief@reminder.test', role: 'CHIEF_COORDINATOR' });
  });

  const declare = async () => {
    const res = await request(app)
      .post('/api/v1/fallback/windows')
      .set('Authorization', bearer(chief))
      .send({ tier: 4, reason: 'Network down at the venue' });
    expect(res.status).toBe(201);
    return res.body.window.id as string;
  };
  const reminders = () =>
    rawDb.scheduledAction.findMany({ where: { type: 'fallback.remind' }, orderBy: { runAt: 'asc' } });

  it('queues the first reminder with the declaration, after the configured interval', async () => {
    const windowId = await declare();
    const [first] = await reminders();
    expect(first).toMatchObject({
      payload: { windowId, sequence: 1 },
      createdByPersonId: null,
      status: 'PENDING',
    });
    expect(first!.runAt).toEqual(at(30));
  });

  it('notifies the declarer and coordinators, then queues the next one', async () => {
    const windowId = await declare();
    const deputy = await createVolunteer({ email: 'deputy@reminder.test', role: 'DEPUTY_COORDINATOR' });
    const coordinator = await createVolunteer({ email: 'other-chief@reminder.test', role: 'CHIEF_COORDINATOR' });
    await createVolunteer({ email: 'ordinary@reminder.test', role: 'VOLUNTEER' });
    const inactive = await createVolunteer({ email: 'inactive-chief@reminder.test', role: 'CHIEF_COORDINATOR' });
    const { eventId } = (await reminders())[0]!;
    // The original declarer remains an explicit recipient after a role change.
    await rawDb.eventMembership.updateMany({ where: { eventId: eventId!, personId: chief.id }, data: { role: 'IC' } });
    await rawDb.eventMembership.updateMany({ where: { eventId: eventId!, personId: inactive.id }, data: { status: 'DEACTIVATED' } });
    expect(await runDue(registry, at(30))).toBe('SUCCEEDED');
    const notices = await rawDb.notice.findMany({ where: { eventId: eventId!, sourceId: windowId } });
    expect(notices.map((row) => row.recipientPersonId).sort()).toEqual([chief.id, deputy.id, coordinator.id].sort());
    for (const notice of notices) expect(notice).toMatchObject({ kind: 'FALLBACK_REMINDER', priority: 'OPERATIONAL',
      sourceKind: 'FALLBACK', sourceId: windowId, transitionKey: `fallback:${windowId}:remind:1`,
      context: { type: 'fallback', sequence: 1 }, createdAt: at(30), expiresAt: null });
    // Default operational preferences retain centre history without creating device sends.
    expect(await rawDb.noticeDelivery.count()).toBe(0);
    const queued = await reminders();
    expect(queued.map((row) => row.status)).toEqual(['SUCCEEDED', 'PENDING']);
    expect(queued[1]).toMatchObject({ payload: { windowId, sequence: 2 } });
    expect(queued[1]!.runAt).toEqual(at(60));
  });

  it('stops once the window is closed', async () => {
    const windowId = await declare();
    await rawDb.fallbackWindow.update({ where: { id: windowId }, data: { endedAt: at(10) } });
    expect(await runDue(registry, at(30))).toBe('SUCCEEDED');
    expect(await rawDb.notice.count()).toBe(0);
    expect(await rawDb.noticeDelivery.count()).toBe(0);
    expect((await reminders()).map((row) => row.status)).toEqual(['SUCCEEDED']);
  });

  it('refuses a reminder a user tried to schedule', async () => {
    const windowId = await declare();
    await rawDb.scheduledAction.updateMany({
      where: { type: 'fallback.remind' },
      data: { createdByPersonId: chief.id },
    });
    expect(await runDue(registry, at(30))).not.toBe('SUCCEEDED');
    expect(await rawDb.fallbackWindow.findUnique({ where: { id: windowId } })).not.toBeNull();
    expect(await rawDb.notice.count()).toBe(0);
    expect(await rawDb.noticeDelivery.count()).toBe(0);
  });
});

describe('the archive reminder', () => {
  const registry = new HandlerRegistry(eventScheduledHandlers);
  let f: ScheduledLifecycleFixture;
  beforeEach(async () => {
    await resetDatabase();
    f = await scheduledLifecycleFixture();
    await rawDb.event.update({ where: { id: f.eventId }, data: { status: 'LIVE' } });
  });

  const closeWithReminder = async () => {
    await f.create({ to: 'CLOSED' });
    expect(await f.run()).toBe('SUCCEEDED');
    return rawDb.scheduledAction.findFirstOrThrow({
      where: { eventId: f.eventId, type: 'event.archiveReminder' },
    });
  };
  const platformAdmin = () =>
    rawDb.organisationMembership.create({
      data: { organisationId: f.organisationId, personId: f.creator.id, role: 'PLATFORM_ADMIN' },
    });

  it('tells the platform admins once the late-sync grace has passed', async () => {
    await platformAdmin();
    const standalone = await createVolunteer({ email: 'standalone-admin@reminder.test', role: 'VOLUNTEER' });
    const inactive = await createVolunteer({ email: 'inactive-platform@reminder.test', role: 'ADMIN' });
    const foreign = await createVolunteer({ email: 'foreign-platform@reminder.test', role: 'ADMIN' });
    await rawDb.organisationMembership.createMany({ data: [standalone, inactive].map((person) => ({
      organisationId: f.organisationId, personId: person.id, role: 'PLATFORM_ADMIN' })) });
    await rawDb.person.update({ where: { id: inactive.id }, data: { deactivatedAt: FROZEN_NOW } });
    const organisation = await rawDb.organisation.create({ data: { slug: 'foreign-reminder', name: 'Foreign reminder', appName: 'Foreign ops', defaultTimezone: 'Asia/Singapore' } });
    await rawDb.organisationMembership.create({ data: { organisationId: organisation.id, personId: foreign.id, role: 'PLATFORM_ADMIN' } });
    const reminder = await closeWithReminder();
    expect(await runDue(registry, reminder.runAt)).toBe('SUCCEEDED');
    const notices = await rawDb.notice.findMany({ where: { eventId: f.eventId } });
    expect(notices.map((row) => row.recipientPersonId).sort()).toEqual([f.creator.id, standalone.id].sort());
    const { lifecycleVersion } = await f.state();
    for (const notice of notices) expect(notice).toMatchObject({ kind: 'ARCHIVE_REMINDER', priority: 'OPERATIONAL',
      sourceKind: 'EVENT', sourceId: f.eventId, transitionKey: `event:${f.eventId}:archive:${lifecycleVersion}`,
      context: { type: 'event', lifecycleVersion }, createdAt: reminder.runAt, expiresAt: null });
    expect(notices.find((row) => row.recipientPersonId === standalone.id)?.recipientMembershipId).toBeNull();
    expect(notices.find((row) => row.recipientPersonId === f.creator.id)?.recipientMembershipId).toBe(f.membershipId);
    expect(await rawDb.noticeDelivery.count()).toBe(0);
  });

  it('stays silent when the event moved on from the close that queued it', async () => {
    await platformAdmin();
    const reminder = await closeWithReminder();
    // A reopen and a second close: still CLOSED, but not the close this reminder belongs to.
    for (const status of ['LIVE', 'CLOSED'] as const) {
      await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    }
    expect(await runDue(registry, reminder.runAt)).toBe('SUCCEEDED');
    expect(await rawDb.notice.count()).toBe(0);
    expect(await rawDb.noticeDelivery.count()).toBe(0);
  });

  it('has nobody to tell without an active platform admin', async () => {
    const reminder = await closeWithReminder();
    expect(await runDue(registry, reminder.runAt)).toBe('SUCCEEDED');
    expect(await rawDb.notice.count()).toBe(0);
    expect(await rawDb.noticeDelivery.count()).toBe(0);
  });
});
