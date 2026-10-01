import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { createEvent } from '../../src/modules/event/index.js';
import { changeSetting } from '../../src/platform/settings/change.js';
import type { SettingKey } from '../../src/platform/settings/registry.js';
import { resetDatabase, rawDb } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const audit = {
  actorId: null,
  actorSub: null,
  eventId: null,
  membershipId: null,
  ip: null,
  userAgent: null,
  requestId: null,
};

async function organisationOf(eventId: string): Promise<string> {
  const event = await rawDb.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { organisationId: true },
  });
  return event.organisationId;
}

async function setLimit(
  organisationId: string,
  key: SettingKey,
  value: number,
  expectedVersion = 0,
): Promise<void> {
  await changeSetting({
    target: { scope: 'platform', organisationId },
    key,
    value,
    expectedVersion,
    actorPersonId: null,
    audit,
  });
}

async function secondOrganisation(): Promise<{ organisationId: string; eventId: string }> {
  const organisation = await rawDb.organisation.upsert({
    where: { slug: 'second-organisation' },
    create: {
      slug: 'second-organisation',
      name: 'Second Organisation',
      appName: 'Second Ops',
      defaultTimezone: 'Asia/Singapore',
      createdAt: new Date('2030-01-01T00:00:00Z'),
    },
    update: {},
  });
  const event = await createEvent({
    organisationId: organisation.id,
    slug: 'second-event',
    name: 'Second Event',
    timezone: 'Asia/Singapore',
    status: 'LIVE',
    categories: [],
    stationTypes: [],
    shiftTemplates: [],
  });
  return { organisationId: organisation.id, eventId: event.id };
}

beforeEach(async () => {
  await resetDatabase();
  vi.setSystemTime(FROZEN_NOW);
});

describe('live platform rate limits', () => {
  it('applies a changed ceiling and the configured window without a restart', async () => {
    const volunteer = await createVolunteer({ email: 'rate-live@test.example', role: 'VOLUNTEER' });
    const { eventId } = await testEvent();
    const organisationId = await organisationOf(eventId);
    await setLimit(organisationId, 'rateLimit.windowSeconds', 10);
    await setLimit(organisationId, 'rateLimit.max.default', 2);
    const me = () =>
      request(app).get(`/api/v1/events/${eventId}/me`).set('Authorization', bearer(volunteer));

    expect((await me()).status).toBe(200);
    expect((await me()).status).toBe(200);
    expect((await me()).status).toBe(429);

    await setLimit(organisationId, 'rateLimit.max.default', 4, 1);
    expect((await me()).status).toBe(200);
    expect((await me()).status).toBe(429);

    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 11_000));
    expect((await me()).status).toBe(200);
  });

  it('counts sign-in failures only and ignores a caller-selected organisation', async () => {
    const volunteer = await createVolunteer({
      email: 'rate-signin@test.example',
      role: 'VOLUNTEER',
    });
    const { eventId } = await testEvent();
    const primaryId = await organisationOf(eventId);
    const other = await secondOrganisation();
    await setLimit(primaryId, 'rateLimit.max.sensitive', 2);
    await setLimit(other.organisationId, 'rateLimit.max.sensitive', 50);
    const signIn = (email: string) =>
      request(app)
        .post(`/api/v1/auth/session?organisationId=${other.organisationId}`)
        .send({ email });

    for (let i = 0; i < 3; i += 1) {
      expect((await signIn(volunteer.email)).status).toBe(201);
    }
    expect((await signIn('missing@second.example')).status).toBe(404);
    expect((await signIn('missing@second.example')).status).toBe(404);
    expect((await signIn('missing@second.example')).status).toBe(429);
  });

  it('isolates authenticated buckets and ceilings by event organisation', async () => {
    const volunteer = await createVolunteer({
      email: 'rate-isolate@test.example',
      role: 'VOLUNTEER',
    });
    const { eventId } = await testEvent();
    const firstId = await organisationOf(eventId);
    const second = await secondOrganisation();
    await rawDb.eventMembership.create({
      data: {
        eventId: second.eventId,
        personId: volunteer.id,
        role: 'VOLUNTEER',
        status: 'ACTIVE',
      },
    });
    await setLimit(firstId, 'rateLimit.max.default', 1);
    await setLimit(second.organisationId, 'rateLimit.max.default', 2);
    const me = (id: string) =>
      request(app).get(`/api/v1/events/${id}/me`).set('Authorization', bearer(volunteer));

    expect((await me(eventId)).status).toBe(200);
    expect((await me(eventId)).status).toBe(429);
    expect((await me(second.eventId)).status).toBe(200);
    expect((await me(second.eventId)).status).toBe(200);
    expect((await me(second.eventId)).status).toBe(429);
  });
});
