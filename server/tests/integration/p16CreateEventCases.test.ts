import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { CreateEventRequest, ERROR_CODES, EventCreatedResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { localAuthIssuer } from '../../src/platform/identity/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';

interface ValidationCase {
  id: string;
  mutation: { remove?: string; replace?: string; add?: string; value?: unknown };
  contractIssues: { path: string[]; code: string }[];
}
const corpus = JSON.parse(
  readFileSync(new URL('../fixtures/p16-create-event-cases.json', import.meta.url), 'utf8'),
) as {
  formatVersion: number;
  cases: ValidationCase[];
  fixtureStartDate: string;
};
const app = createApp();
const origin = 'http://localhost:3000';
let base: CreateEventRequest;
let accessToken: string;
let personId: string;
beforeEach(async () => {
  await resetDatabase();
  const organisation = await rawDb.organisation.create({
    data: {
      slug: 'p16-initial',
      name: 'Synthetic P16 organisation',
      appName: 'Synthetic P16',
      defaultTimezone: 'Asia/Singapore',
    },
  });
  const subject = randomUUID();
  const person = await rawDb.person.create({
    data: {
      email: 'initial-p16@example.test',
      displayName: 'Initial P16 administrator',
      cognitoSub: subject,
    },
  });
  personId = person.id;
  await rawDb.organisationMembership.create({
    data: { organisationId: organisation.id, personId, role: 'PLATFORM_ADMIN' },
  });
  // Local CI verifies its declared provider credential and opens a real stored API SID.
  // This fixture is never a substitute for the controlled Cognito staging journey.
  const providerAccessToken = await localAuthIssuer!.issue({ sub: subject, groups: [] });
  const opened = await request(app)
    .post('/api/v1/auth/session')
    .set('Origin', origin)
    .send({ providerAccessToken })
    .expect(201);
  expect(opened.body.mfaRequired ?? false).toBe(false);
  accessToken = opened.body.accessToken as string;
  base = CreateEventRequest.parse({
    organisationId: organisation.id,
    name: 'Synthetic API Campaign',
    slug: 'synthetic-api-campaign',
    venue: 'Synthetic venue',
    timezone: 'Asia/Singapore',
    startDate: corpus.fixtureStartDate,
    endDate: corpus.fixtureStartDate,
    joinAsAdmin: true,
    idempotencyKey: randomUUID(),
  });
});
const post = (body: object) =>
  request(app)
    .post('/api/v1/events')
    .set('Origin', origin)
    .set('Authorization', 'Bearer ' + accessToken)
    .send(body);

it('retains the reviewed case count and every required field omission, wrong type and null binding', () => {
  expect(corpus.formatVersion).toBe(1);
  expect(corpus.cases).toHaveLength(44);
  const ids = new Set(corpus.cases.map((item) => item.id));
  expect(ids.size).toBe(44);
  for (const field of Object.keys(CreateEventRequest.shape))
    for (const kind of ['missing-required', 'wrong-type', 'null'])
      expect(ids.has(`${kind}:${field}`)).toBe(true);
});

it.each(corpus.cases)(
  'refuses $id over authenticated HTTP with its exact issues and no event or membership effect',
  async (item) => {
    const body: Record<string, unknown> = { ...base };
    const mutation = item.mutation;
    if (mutation.remove) delete body[mutation.remove];
    if (mutation.replace) body[mutation.replace] = mutation.value;
    if (mutation.add) body[mutation.add] = mutation.value;
    const response = await post(body).expect(400);
    expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(
      response.body.error.details.issues.map((issue: { path: string; code: string }) => ({
        path: issue.path,
        code: issue.code,
      })),
    ).toEqual(
      item.contractIssues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
    );
    expect(await rawDb.event.count()).toBe(0);
    expect(await rawDb.eventMembership.count()).toBe(0);
  },
);

it('refuses missing and effectively forged credentials before creating the first event', async () => {
  await request(app).post('/api/v1/events').set('Origin', origin).send(base).expect(401);
  const parts = accessToken.split('.');
  const signature = Buffer.from(parts[2]!, 'base64url');
  signature[0]! ^= 1;
  await request(app)
    .post('/api/v1/events')
    .set('Origin', origin)
    .set(
      'Authorization',
      'Bearer ' + parts.slice(0, 2).join('.') + '.' + signature.toString('base64url'),
    )
    .send(base)
    .expect(401);
  expect(await rawDb.event.count()).toBe(0);
  expect(await rawDb.eventMembership.count()).toBe(0);
});

it('creates and explicitly joins one real event, replays exactly and refuses changed intent on the same receipt', async () => {
  const created = await post(base).expect(201);
  EventCreatedResponse.parse(created.body);
  expect(created.body).toMatchObject({
    joined: true,
    event: { name: base.name, slug: base.slug, status: 'DRAFT' },
  });
  const replay = await post(base).expect(201);
  expect(replay.body).toEqual(created.body);
  const changed = await post({ ...base, name: 'Changed synthetic intent' }).expect(409);
  expect(changed.body.error.code).toBe(ERROR_CODES.IDEMPOTENCY_KEY_REUSE);
  expect(await rawDb.event.count()).toBe(1);
  expect(await rawDb.eventMembership.findMany()).toMatchObject([
    { eventId: created.body.event.id, personId, role: 'ADMIN', status: 'ACTIVE' },
  ]);
});
