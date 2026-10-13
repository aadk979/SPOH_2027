import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import * as audit from '../../src/platform/audit/index.js';
import { identityProvider } from '../../src/platform/identity/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { defaultRoleGrantRows } from '../../src/platform/access/authorizer/roleGrants.js';

const app = createApp();
let admin: TestVolunteer;
let deputy: TestVolunteer;
let target: TestVolunteer;
let eventId: string;
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'roster-boundary-admin@example.test', role: 'ADMIN' });
  deputy = await createVolunteer({ email: 'roster-boundary-deputy@example.test', role: 'DEPUTY_COORDINATOR' });
  target = await createVolunteer({ email: 'roster-boundary-target@example.test', role: 'VOLUNTEER' });
});
afterEach(() => vi.restoreAllMocks());
const invite = (body: object, actor = admin, scope = eventId) => request(app)
  .post(`/api/v1/events/${scope}/roster/volunteers`).set('Authorization', bearer(actor)).send(body);
const importRows = (rows: object[], actor = admin) => request(app)
  .post(`/api/v1/events/${eventId}/roster/import`).set('Authorization', bearer(actor)).send({ rows, commit: true });
const newPerson = () => ({ email: 'journalled-new@example.test', displayName: 'Journalled New', role: 'VOLUNTEER' });
async function secondEvent(foreign = false) {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const organisationId = foreign ? (await rawDb.organisation.create({ data: {
    slug: 'foreign-roster-org', name: 'Foreign Organisation', appName: 'Foreign Operations', defaultTimezone: event.timezone,
  } })).id : event.organisationId;
  const other = await rawDb.event.create({ data: { organisationId, slug: 'roster-boundary-other',
    name: 'Other Roster Event', timezone: event.timezone, status: 'DRAFT' } });
  await rawDb.rolePermission.createMany({ data: defaultRoleGrantRows().map((grant) => ({ eventId: other.id, ...grant })) });
  return other;
}

it('allows a Deputy to import unchanged roles but refuses an actual role change', async () => {
  await importRows([{ email: target.email, displayName: target.email, role: 'VOLUNTEER' }], deputy).expect(200);
  await importRows([{ email: target.email, displayName: target.email, role: 'IC' }], deputy).expect(403);
  expect(await rawDb.eventMembership.findUnique({ where: { eventId_personId: { eventId, personId: target.id } } }))
    .toMatchObject({ role: 'VOLUNTEER' });
  await importRows([{ email: target.email, displayName: target.email, role: 'IC' }]).expect(200);
});

it.each(['provision', 'import'] as const)('refuses foreign-only email reuse through %s without leaking or changing its profile', async (operation) => {
  const other = await secondEvent(true);
  const foreign = await rawDb.person.create({ data: { email: 'foreign-only@example.test', displayName: 'PRIVATE-FOREIGN-NAME',
    phone: 'PRIVATE-FOREIGN-PHONE', cognitoSub: 'foreign-only-subject' } });
  await rawDb.eventMembership.create({ data: { eventId: other.id, personId: foreign.id } });
  const body = { email: foreign.email, displayName: 'Requested Profile', role: 'VOLUNTEER' };
  const response = operation === 'provision' ? await invite(body) : await importRows([body]);
  expect(response.status).toBe(403);
  expect(JSON.stringify(response.body)).not.toMatch(/PRIVATE-FOREIGN|foreign-only-subject/);
  expect(await rawDb.person.findUnique({ where: { id: foreign.id } })).toMatchObject({
    displayName: 'PRIVATE-FOREIGN-NAME', phone: 'PRIVATE-FOREIGN-PHONE', cognitoSub: foreign.cognitoSub,
  });
  expect(await rawDb.eventMembership.count({ where: { eventId, personId: foreign.id } })).toBe(0);
});

it('reuses a same-organisation identity as membership-only work and preserves the global profile', async () => {
  const other = await secondEvent();
  await rawDb.eventMembership.create({ data: { eventId: other.id, personId: admin.id, role: 'ADMIN' } });
  await rawDb.person.update({ where: { id: target.id }, data: { displayName: 'Original Profile', phone: '+65 12345678' } });
  const response = await invite({ email: target.email.toUpperCase(), displayName: 'Unrequested Global Edit' }, admin, other.id).expect(201);
  expect(response.body.volunteer).toMatchObject({ id: target.id, displayName: 'Original Profile', phone: '+65 12345678' });
  expect(await rawDb.person.findUnique({ where: { id: target.id } })).toMatchObject({ displayName: 'Original Profile', phone: '+65 12345678' });
});

it('resumes suppressed creation after account creation and final SQL audit rollback without creating a second account', async () => {
  const ensure = vi.spyOn(identityProvider, 'ensureUser').mockResolvedValue({ sub: 'journalled-created-subject', created: true, username: 'journalled-new@example.test' });
  const send = vi.spyOn(identityProvider, 'resendInvite').mockResolvedValue(true);
  const original = audit.writeAudit;
  let fail = true;
  vi.spyOn(audit, 'writeAudit').mockImplementation(async (tx, input) => {
    if (input.action === 'user.provision' && fail) { fail = false; throw new Error('injected audit rollback'); }
    return original(tx, input);
  });
  await invite(newPerson()).expect(500);
  const operation = await rawDb.identityAccountOperation.findFirstOrThrow();
  expect(operation.state).toBe('PROVIDER_READY');
  expect(await rawDb.person.count({ where: { email: newPerson().email } })).toBe(0);
  expect(send).not.toHaveBeenCalled();
  const resumed = await invite(newPerson()).expect(201);
  expect(resumed.body.volunteer.id).toBe(operation.plannedPersonId);
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(ensure).toHaveBeenCalledWith(expect.objectContaining({ operationId: operation.id }));
  expect(send).toHaveBeenCalledTimes(1);
  expect(await rawDb.identityAccountOperation.findUnique({ where: { id: operation.id } })).toMatchObject({
    state: 'BOUND', personId: operation.plannedPersonId,
  });
});

it('rechecks current actor authority after the provider call before binding', async () => {
  vi.spyOn(identityProvider, 'ensureUser').mockImplementation(async () => {
    await rawDb.eventMembership.update({ where: { eventId_personId: { eventId, personId: admin.id } }, data: { role: 'VOLUNTEER' } });
    return { sub: 'unbound-withdrawn-authority', created: true, username: newPerson().email };
  });
  const send = vi.spyOn(identityProvider, 'resendInvite');
  const result = await invite(newPerson());
  expect(result.status).toBe(403);
  expect(await rawDb.person.count({ where: { email: newPerson().email } })).toBe(0);
  expect(await rawDb.identityAccountOperation.findFirst()).toMatchObject({ state: 'PROVIDER_READY' });
  expect(send).not.toHaveBeenCalled();
});

it('one ambiguous initial invitation stays bound and is never automatically sent again', async () => {
  vi.spyOn(identityProvider, 'ensureUser').mockResolvedValue({ sub: 'unknown-delivery-subject', created: true, username: newPerson().email });
  const send = vi.spyOn(identityProvider, 'resendInvite').mockRejectedValue(new Error('AMBIGUOUS-PRIVATE-PROVIDER-BODY'));
  const first = await invite(newPerson()).expect(503);
  expect(JSON.stringify(first.body)).not.toContain('AMBIGUOUS-PRIVATE');
  const operation = await rawDb.identityAccountOperation.findFirstOrThrow();
  expect(operation.state).toBe('BOUND');
  expect(await rawDb.identityInvitationAttempt.findFirst()).toMatchObject({ state: 'DELIVERY_UNKNOWN', accountId: operation.id });
  await invite(newPerson()).expect(503);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await rawDb.identityInvitationAttempt.count()).toBe(1);
});

it('role mutation and credential invalidation roll back together when audit fails', async () => {
  const opened = await request(app).post('/api/v1/auth/session').set('Origin', 'http://localhost:3000').send({ email: target.email }).expect(201);
  const sid = decodeJwt(opened.body.accessToken as string).sid as string;
  const original = audit.writeAudit;
  vi.spyOn(audit, 'writeAudit').mockImplementation(async (tx, input) => {
    if (input.action === 'user.update') throw new Error('role audit failure');
    return original(tx, input);
  });
  await importRows([{ email: target.email, displayName: target.email, role: 'IC' }]).expect(500);
  expect(await rawDb.eventMembership.findUnique({ where: { eventId_personId: { eventId, personId: target.id } } }))
    .toMatchObject({ role: 'VOLUNTEER' });
  expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: sid } })).revokedAt).toBeNull();
});

it('refuses inconsistent repeated identity rows before any provider operation', async () => {
  const ensure = vi.spyOn(identityProvider, 'ensureUser');
  await importRows([newPerson(), { ...newPerson(), role: 'IC' }]).expect(400);
  expect(ensure).not.toHaveBeenCalled();
  expect(await rawDb.identityAccountOperation.count()).toBe(0);
});

it('intentional resend retries keep one durable delivery attempt even when the HTTP receipt fails', async () => {
  const send = vi.spyOn(identityProvider, 'resendInvite').mockRejectedValue(new Error('delivery timeout'));
  const key = randomUUID();
  const path = `/api/v1/events/${eventId}/admin/volunteers/${target.id}/resend-invite`;
  for (let attempt = 0; attempt < 2; attempt++) await request(app).post(path).set('Authorization', bearer(admin))
    .send({ idempotencyKey: key }).expect(503);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await rawDb.identityInvitationAttempt.count()).toBe(1);
  expect(send).toHaveBeenCalledWith(target.email, target.sub);
});
