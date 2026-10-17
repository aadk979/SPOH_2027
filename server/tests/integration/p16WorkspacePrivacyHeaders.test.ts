import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { ErrorBody, ERROR_CODES } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb } from '../helpers/db.js';
import { bearer, createVolunteer, type TestVolunteer } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';

const app = createApp();

it('forbids caching a terminal API route refusal', async () => {
  const response = await request(app).get('/api/v1/workspace-privacy-unknown-route');
  expect(response.status).toBe(404);
  expect(ErrorBody.parse(response.body).error.code).toBe(ERROR_CODES.NOT_FOUND);
  expect(response.headers['cache-control']).toBe('no-store');
});

let fixture: WorkspaceFixture;
let foreign: TestVolunteer;
beforeEach(async () => {
  fixture = await workspaceFixture();
  foreign = await createVolunteer({
    email: 'workspace-privacy-foreign@example.test',
    role: 'VOLUNTEER',
  });
  const organisation = await rawDb.organisation.create({
    data: {
      slug: 'workspace-privacy-foreign-org',
      name: 'Synthetic foreign organisation',
      appName: 'Synthetic privacy test',
      defaultTimezone: 'Asia/Singapore',
    },
  });
  const event = await rawDb.event.create({
    data: {
      organisationId: organisation.id,
      slug: 'workspace-privacy-foreign-event',
      name: 'Synthetic foreign event',
      timezone: 'Asia/Singapore',
      status: 'LIVE',
    },
  });
  await rawDb.eventMembership.updateMany({
    where: { personId: foreign.id, eventId: fixture.eventId },
    data: { eventId: event.id },
  });
});

it.each(['entity', 'records', 'search'] as const)(
  '%s forbids caching scope and auth refusals before the workspace router',
  async (route) => {
    const query =
      route === 'entity'
        ? { kind: 'station', id: fixture.first }
        : route === 'records'
          ? { kind: 'footfall', rehearsal: 'false', limit: '1' }
          : { query: 'SOURCE_FIRST' };
    const path = `/api/v1/events/${fixture.eventId}/workspace/${route}`;
    const own = await request(app)
      .get(path)
      .set('Authorization', bearer(fixture.admin))
      .query(query);
    expect(own.status).toBe(200);
    expect(own.headers['cache-control']).toBe('private, no-store');

    const hidden = await request(app).get(path).set('Authorization', bearer(foreign)).query(query);
    expect(hidden.status).toBe(404);
    expect(ErrorBody.parse(hidden.body).error.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(
      hidden.headers['cache-control']?.split(',').map((value: string) => value.trim()) ?? [],
    ).toContain('no-store');

    const missing = await request(app).get(path).query(query);
    expect(missing.status).toBe(401);
    expect(ErrorBody.parse(missing.body).error.code).toBe(ERROR_CODES.UNAUTHENTICATED);
    expect(
      missing.headers['cache-control']?.split(',').map((value: string) => value.trim()) ?? [],
    ).toContain('no-store');

    const alias = await request(app)
      .get(`/api/v1/workspace/${route}`)
      .set('Authorization', bearer(foreign))
      .query(query);
    expect(alias.status).toBe(403);
    expect(ErrorBody.parse(alias.body).error.code).toBe(ERROR_CODES.NOT_PROVISIONED);
    expect(
      alias.headers['cache-control']?.split(',').map((value: string) => value.trim()) ?? [],
    ).toContain('no-store');

    const invalid = await request(app)
      .get(path)
      .set('Authorization', bearer(fixture.admin))
      .query({ ...query, unexpected: '1' });
    expect(invalid.status).toBe(400);
    expect(ErrorBody.parse(invalid.body).error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(invalid.headers['cache-control']).toBe('private, no-store');
  },
);
