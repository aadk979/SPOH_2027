import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { ErrorBody, MyAssignment } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { changeSetting } from '../../src/platform/settings/change.js';
import { settleDenials } from '../../src/platform/http/authorizationDenials.js';
import { settleQuotaRefunds } from '../../src/platform/http/quotaRequestCharge.js';
import { rawDb } from '../helpers/db.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
const app = createApp();
let fixture: WorkspaceFixture;
const audit = {
  actorId: null,
  actorSub: null,
  eventId: null,
  membershipId: null,
  ip: null,
  userAgent: null,
  requestId: null,
};
beforeEach(async () => {
  expect(new URL(process.env.DATABASE_URL ?? '').pathname).toBe('/spoh2027_test');
  expect(process.env.TEST_DATABASE_URL).toBe(process.env.DATABASE_URL);
  expect(process.env.SPOH_SKIP_DOTENV).toBe('1');
  fixture = await workspaceFixture();
});
async function business() {
  return {
    people: await rawDb.person.findMany({ orderBy: { id: 'asc' } }),
    memberships: await rawDb.eventMembership.findMany({ orderBy: { id: 'asc' } }),
    assignments: await rawDb.shiftAssignment.findMany({ orderBy: { id: 'asc' } }),
    audit: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
  };
}
it.each(['scoped', 'alias'] as const)(
  '%s direct default-quota refusal carries typed public error and explicit no-store without changing selected business rows',
  async (form) => {
    const admitted = await request(app)
      .post('/api/v1/auth/session')
      .set('Origin', 'http://localhost:3000')
      .send({ providerAccessToken: fixture.volunteer.token });
    expect(admitted.status).toBe(201);
    expect(admitted.body.mfaRequired ?? false).toBe(false);
    await settleQuotaRefunds();
    await settleDenials();
    const organisationId = (
      await rawDb.event.findUniqueOrThrow({
        where: { id: fixture.eventId },
        select: { organisationId: true },
      })
    ).organisationId;
    for (const [key, value] of [
      ['rateLimit.windowSeconds', 10],
      ['rateLimit.max.default', 1],
    ] as const)
      await changeSetting({
        target: { scope: 'platform', organisationId },
        key,
        value,
        expectedVersion: 0,
        actorPersonId: null,
        audit,
      });
    const before = await business(),
      prefix = form === 'scoped' ? '/api/v1/events/' + fixture.eventId : '/api/v1',
      get = () =>
        request(app)
          .get(prefix + '/roster/me')
          .set('Authorization', 'Bearer ' + admitted.body.accessToken);
    const accepted = await get();
    expect(accepted.status).toBe(200);
    expect(accepted.headers['cache-control']).toBe('private, no-store');
    expect(accepted.body.data.map((v: unknown) => MyAssignment.parse(v))).toHaveLength(1);
    const refused = await get();
    expect(refused.status).toBe(429);
    const error = ErrorBody.parse(refused.body).error;
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toBe('Too many requests. Slow down and try again shortly.');
    expect(typeof error.requestId).toBe('string');
    expect(Object.keys(refused.body)).toEqual(['error']);
    expect(
      (refused.headers['cache-control'] ?? '').split(',').map((v: string) => v.trim()),
    ).toContain('no-store');
    await settleDenials();
    expect(await business()).toEqual(before);
  },
);
