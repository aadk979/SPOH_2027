import { beforeEach, expect, it, vi } from 'vitest';
import { startScheduledJobs } from '../../src/app/startScheduledJobs.js';
import { JOBS } from '../../src/app/jobs.js';
import { createEvent } from '../../src/modules/event/index.js';
import * as events from '../../src/platform/event/events.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let eventId: string;
let instant = FROZEN_NOW;
const clock = { now: () => instant };
const at = (offset: number) => new Date(FROZEN_NOW.getTime() + offset);
const newEvent = async () => {
  const existing = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  return createEvent({
    organisationId: existing.organisationId,
    slug: 'created-after-boot',
    name: 'After boot',
    timezone: existing.timezone,
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
};
const occurrence = (id = eventId) =>
  rawDb.scheduledAction.findFirstOrThrow({ where: { eventId: id, type: 'lostPerson.purge' } });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  instant = FROZEN_NOW;
});

it('two real API worker boots create one event recurrence and remove the legacy purge interval', async () => {
  const workers = await Promise.all([startScheduledJobs(clock), startScheduledJobs(clock)]);
  try {
    await Promise.all(workers.map((worker) => worker.tick()));
    expect(await rawDb.scheduledAction.count()).toBe(4);
    expect(await occurrence()).toMatchObject({
      createdByPersonId: null,
      payload: {},
      status: 'PENDING',
      recurrence: 900,
      runAt: at(900_000),
      scheduledFor: at(900_000),
    });
    expect(JOBS.some((job) => job.name === 'lost-person purge')).toBe(false);
  } finally {
    await Promise.all(workers.map((worker) => worker.stop()));
  }
});

it('discovers events created after boot at the one-minute boundary without postponing old occurrences', async () => {
  const worker = await startScheduledJobs(clock);
  try {
    await worker.tick();
    const original = await occurrence();
    const fresh = await newEvent();
    instant = at(59_999);
    await worker.tick();
    expect(await rawDb.scheduledAction.count({ where: { eventId: fresh.id } })).toBe(0);
    instant = at(60_000);
    await worker.tick();
    expect(await occurrence(fresh.id)).toMatchObject({
      recurrence: 900,
      runAt: at(960_000),
      status: 'PENDING',
    });
    expect(await occurrence()).toEqual(original);
    instant = at(959_999);
    await worker.tick();
    expect((await occurrence(fresh.id)).status).toBe('PENDING');
    instant = at(960_000);
    await worker.tick();
    expect((await occurrence(fresh.id)).status).toBe('SUCCEEDED');
    expect(
      await rawDb.scheduledAction.count({
        where: { eventId: fresh.id, type: 'lostPerson.purge', status: 'PENDING' },
      }),
    ).toBe(1);
  } finally {
    await worker.stop();
  }
});

it('retries failed discovery on the next tick without claiming old work or waiting another minute', async () => {
  const worker = await startScheduledJobs(clock);
  try {
    await worker.tick();
    const fresh = await newEvent();
    instant = at(900_000);
    const spy = vi
      .spyOn(events, 'allEventScopes')
      .mockRejectedValueOnce(new Error('private discovery fault'));
    try {
      await expect(worker.tick()).rejects.toThrow('private discovery fault');
    } finally {
      spy.mockRestore();
    }
    expect((await occurrence()).status).toBe('PENDING');
    expect(await rawDb.scheduledAction.count({ where: { eventId: fresh.id } })).toBe(0);
    await worker.tick();
    expect((await occurrence()).status).toBe('SUCCEEDED');
    expect(await occurrence(fresh.id)).toMatchObject({ status: 'PENDING', runAt: at(1800_000) });
  } finally {
    await worker.stop();
  }
});

it.each(['FAILED', 'DEAD', 'CANCELLED'] as const)(
  'discovery preserves %s work for investigation',
  async (status) => {
    const worker = await startScheduledJobs(clock);
    try {
      await worker.tick();
      const action = await occurrence();
      const terminal = await rawDb.scheduledAction.update({
        where: { id: action.id },
        data: {
          status,
          attempts: 5,
          completedAt: FROZEN_NOW,
          lastError: 'EXECUTION_FAILED',
          version: { increment: 1 },
        },
      });
      instant = at(60_000);
      await worker.tick();
      expect(await occurrence()).toEqual(terminal);
      expect(
        await rawDb.scheduledAction.count({ where: { eventId, type: 'lostPerson.purge' } }),
      ).toBe(1);
    } finally {
      await worker.stop();
    }
  },
);
