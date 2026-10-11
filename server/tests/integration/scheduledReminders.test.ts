import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { eventScheduledHandlers } from '../../src/modules/event/index.js';
import { fallbackScheduledHandlers } from '../../src/modules/fallback/index.js';
import * as notification from '../../src/modules/notification/index.js';
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
    const dispatch = vi.spyOn(notification, 'dispatch');
    expect(await runDue(registry, at(30))).toBe('SUCCEEDED');
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: expect.any(String) }),
      expect.objectContaining({
        kind: 'fallback.reminder',
        tag: `fallback-open:${windowId}`,
        audience: expect.objectContaining({
          minimumRole: 'DEPUTY_COORDINATOR',
          volunteerIds: [chief.id],
        }),
      }),
      at(30),
    );
    const queued = await reminders();
    expect(queued.map((row) => row.status)).toEqual(['SUCCEEDED', 'PENDING']);
    expect(queued[1]).toMatchObject({ payload: { windowId, sequence: 2 } });
    expect(queued[1]!.runAt).toEqual(at(60));
  });

  it('stops once the window is closed', async () => {
    const windowId = await declare();
    await rawDb.fallbackWindow.update({ where: { id: windowId }, data: { endedAt: at(10) } });
    const dispatch = vi.spyOn(notification, 'dispatch');
    expect(await runDue(registry, at(30))).toBe('SUCCEEDED');
    expect(dispatch).not.toHaveBeenCalled();
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
    const reminder = await closeWithReminder();
    const dispatch = vi.spyOn(notification, 'dispatch');
    expect(await runDue(registry, reminder.runAt)).toBe('SUCCEEDED');
    expect(dispatch).toHaveBeenCalledWith(
      { eventId: f.eventId },
      expect.objectContaining({
        kind: 'event.archiveReminder',
        audience: { everyone: false, volunteerIds: [f.creator.id] },
      }),
      reminder.runAt,
    );
  });

  it('stays silent when the event moved on from the close that queued it', async () => {
    await platformAdmin();
    const reminder = await closeWithReminder();
    // A reopen and a second close: still CLOSED, but not the close this reminder belongs to.
    for (const status of ['LIVE', 'CLOSED'] as const) {
      await rawDb.event.update({ where: { id: f.eventId }, data: { status } });
    }
    const dispatch = vi.spyOn(notification, 'dispatch');
    expect(await runDue(registry, reminder.runAt)).toBe('SUCCEEDED');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('has nobody to tell without an active platform admin', async () => {
    const reminder = await closeWithReminder();
    const dispatch = vi.spyOn(notification, 'dispatch');
    expect(await runDue(registry, reminder.runAt)).toBe('SUCCEEDED');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
