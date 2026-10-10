import {
  MemberPermissionsResponse,
  RolePermissionsResponse,
  SimulatePermissionResponse,
} from '@spoh/shared';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  makePlatformAdmin,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * The role permissions editor (P11.7): the table, a platform admin's toggle taking effect on the
 * next request, the refusals an editor meets, and the simulator explaining a decision.
 */
let app: Express;
let eventId: string;

const url = (path: string) => `/api/v1/events/${eventId}${path}`;
const get = (who: TestVolunteer, path: string) =>
  request(app).get(url(path)).set('Authorization', bearer(who));
const change = (who: TestVolunteer, body: object) =>
  request(app)
    .put(url('/permissions'))
    .set('Authorization', bearer(who))
    .send({ idempotencyKey: idempotencyKey(), ...body });

async function platformAdmin(): Promise<TestVolunteer> {
  const admin = await createVolunteer({ email: 'platform@perm-editor.test', role: 'ADMIN' });
  await makePlatformAdmin(admin.id);
  return admin;
}

beforeEach(async () => {
  await resetDatabase();
  app = createApp();
  ({ eventId } = await testEvent());
});

describe('the role permissions table', () => {
  it('lists every role with its grants, and who may edit', async () => {
    const chief = await createVolunteer({
      email: 'chief@perm-editor.test',
      role: 'CHIEF_COORDINATOR',
    });
    const response = await get(chief, '/permissions');
    expect(response.status).toBe(200);
    const { data } = RolePermissionsResponse.parse(response.body);
    expect(data.roles.map((role) => role.role)).toHaveLength(6);
    expect(data.canEdit).toBe(false);
    const volunteer = data.roles.find((role) => role.role === 'VOLUNTEER');
    expect(volunteer?.grants).toContain('Registration.Create');
    expect(data.actions.find((row) => row.action === 'Self.Read')).toMatchObject({
      editable: false,
      minimumRole: null,
    });
    expect(data.actions.find((row) => row.action === 'Announcement.SendStation')).toMatchObject({
      editable: true,
      minimumRole: 'IC',
      label: 'send announcements to a station',
    });
    expect(data.guardrails.map((guardrail) => guardrail.id)).toContain('guardrail.not-on-yourself');
  });

  it('refuses a role without Settings.Read, naming what it cannot do', async () => {
    const volunteer = await createVolunteer({ email: 'v@perm-editor.test', role: 'VOLUNTEER' });
    const response = await get(volunteer, '/permissions');
    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe(
      "You cannot see the event's configuration in this event.",
    );
    expect(response.body.error.details).toEqual({ actions: ['Settings.Read'] });
  });

  it('shows a platform admin that they may edit', async () => {
    const admin = await platformAdmin();
    const { data } = RolePermissionsResponse.parse((await get(admin, '/permissions')).body);
    expect(data.canEdit).toBe(true);
  });
});

describe('changing a grant', () => {
  it("takes effect on the role's next request, with an audit row", async () => {
    const admin = await platformAdmin();
    const lead = await createVolunteer({ email: 'lead@perm-editor.test', role: 'LEAD' });
    expect((await get(lead, '/permissions')).status).toBe(403);

    const granted = await change(admin, { role: 'LEAD', action: 'Settings.Read', granted: true });
    expect(granted.status).toBe(200);
    const { data } = RolePermissionsResponse.parse(granted.body);
    expect(data.roles.find((role) => role.role === 'LEAD')?.grants).toContain('Settings.Read');
    expect((await get(lead, '/permissions')).status).toBe(200);

    const audit = await rawDb.auditLog.findMany({
      where: { eventId, action: 'permissions.change' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: admin.id,
      before: { role: 'LEAD', action: 'Settings.Read', granted: false },
      after: { role: 'LEAD', action: 'Settings.Read', granted: true },
    });
  });

  it('revokes a grant, and the refusal names it', async () => {
    const admin = await platformAdmin();
    const chief = await createVolunteer({
      email: 'chief2@perm-editor.test',
      role: 'CHIEF_COORDINATOR',
    });
    expect((await get(chief, '/reports/summary')).status).toBe(200);
    const revoked = await change(admin, {
      role: 'CHIEF_COORDINATOR',
      action: 'Report.Generate',
      granted: false,
    });
    expect(revoked.status).toBe(200);
    const refused = await get(chief, '/reports/summary');
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toBe('You cannot see reports in this event.');
  });

  it('writes nothing when the grant already says so', async () => {
    const admin = await platformAdmin();
    const response = await change(admin, {
      role: 'VOLUNTEER',
      action: 'Registration.Create',
      granted: true,
    });
    expect(response.status).toBe(200);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'permissions.change' } })).toBe(
      0,
    );
  });

  it('is for platform admins only', async () => {
    const chief = await createVolunteer({
      email: 'chief3@perm-editor.test',
      role: 'CHIEF_COORDINATOR',
    });
    const response = await change(chief, { role: 'LEAD', action: 'Settings.Read', granted: true });
    expect(response.status).toBe(403);
    expect(
      await rawDb.rolePermission.count({
        where: { eventId, role: 'LEAD', action: 'Settings.Read' },
      }),
    ).toBe(0);
  });

  it('refuses a fixed permission and a role below the minimum', async () => {
    const admin = await platformAdmin();
    const fixed = await change(admin, { role: 'VOLUNTEER', action: 'Self.Read', granted: false });
    expect(fixed.status).toBe(400);
    expect(fixed.body.error.message).toBe('That permission is fixed.');
    const below = await change(admin, {
      role: 'VOLUNTEER',
      action: 'Announcement.SendStation',
      granted: true,
    });
    expect(below.status).toBe(400);
    expect(below.body.error.details).toMatchObject({ minimumRole: 'IC' });
  });

  it('replays a retried change instead of applying it twice', async () => {
    const admin = await platformAdmin();
    const body = {
      idempotencyKey: idempotencyKey(),
      role: 'LEAD',
      action: 'Settings.Read',
      granted: true,
    };
    const send = () =>
      request(app).put(url('/permissions')).set('Authorization', bearer(admin)).send(body);
    const first = await send();
    const second = await send();
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'permissions.change' } })).toBe(
      1,
    );
  });
});

describe('the simulator', () => {
  it('explains a refusal by a missing grant', async () => {
    const chief = await createVolunteer({
      email: 'chief4@perm-editor.test',
      role: 'CHIEF_COORDINATOR',
    });
    const volunteer = await createVolunteer({ email: 'v2@perm-editor.test', role: 'VOLUNTEER' });
    const response = await request(app)
      .post(url('/permissions/simulate'))
      .set('Authorization', bearer(chief))
      .send({ personId: volunteer.id, action: 'Report.Generate' });
    expect(response.status).toBe(200);
    const { data } = SimulatePermissionResponse.parse(response.body);
    expect(data).toEqual({
      allowed: false,
      policies: [],
      explanation: 'Their role has not been given permission to see reports.',
    });
  });

  it('explains a guardrail, and an allowed action', async () => {
    const chief = await createVolunteer({
      email: 'chief5@perm-editor.test',
      role: 'CHIEF_COORDINATOR',
    });
    const simulate = (action: string) =>
      request(app)
        .post(url('/permissions/simulate'))
        .set('Authorization', bearer(chief))
        .send({ personId: chief.id, action });
    const archive = SimulatePermissionResponse.parse((await simulate('Event.Archive')).body).data;
    expect(archive.allowed).toBe(false);
    expect(archive.explanation).toContain('platform admins only');
    const reports = SimulatePermissionResponse.parse((await simulate('Report.Generate')).body).data;
    expect(reports.allowed).toBe(true);
    expect(reports.policies).toContain('grant.Report.Generate');
  });

  it('answers 404 for someone who is not in this event', async () => {
    const chief = await createVolunteer({
      email: 'chief6@perm-editor.test',
      role: 'CHIEF_COORDINATOR',
    });
    const response = await request(app)
      .post(url('/permissions/simulate'))
      .set('Authorization', bearer(chief))
      .send({ personId: 'no-such-person', action: 'Self.Read' });
    expect(response.status).toBe(404);
  });
});

describe('what someone can do', () => {
  it("is the answer the member's own screens get", async () => {
    const chief = await createVolunteer({
      email: 'chief7@perm-editor.test',
      role: 'CHIEF_COORDINATOR',
    });
    const volunteer = await createVolunteer({ email: 'v3@perm-editor.test', role: 'VOLUNTEER' });
    const response = await get(chief, `/permissions/people/${volunteer.id}`);
    expect(response.status).toBe(200);
    const { data } = MemberPermissionsResponse.parse(response.body);
    expect(data).toMatchObject({ personId: volunteer.id, role: 'VOLUNTEER' });
    expect(data.actions['Incident.Report']).toBe(true);
    expect(data.actions['Report.Generate']).toBe(false);
    const own = await get(volunteer, '/me/permissions');
    expect(own.body.actions).toEqual(data.actions);
  });
});
