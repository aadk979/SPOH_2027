import { randomUUID } from 'node:crypto';
import type { Router } from 'express';
import request from 'supertest';
import { ROLE_IDS } from '@spoh/access-policies';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { PLATFORM_ROUTES } from '../../src/app/routes.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, makePlatformAdmin, testEvent } from '../helpers/fixtures.js';
import { insertContentPublicationFixture } from '../helpers/content.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const personRoutes = ['GET /people/:id', 'GET /people/:id/data', 'POST /people/:id/erase',
  'POST /people/:id/deactivate', 'POST /people/:id/reactivate'];
const noticeRoutes = ['GET /notification-centre/:id', 'PUT /notification-centre/:id/read'];
const sessionRoutes = ['DELETE /auth/sessions/:id'];
interface Layer { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: unknown } }
function privateIdInventory() {
  const routes: string[] = [];
  for (const { path, router } of PLATFORM_ROUTES) {
    for (const layer of (router as Router & { stack: Layer[] }).stack) {
      if (layer.handle?.stack) throw new Error(`Inventory nested router ${path} explicitly.`);
      if (!layer.route || !layer.route.path.includes(':')) continue;
      const route = `${path}${layer.route.path}`;
      // Approved anonymous branding uses public slugs and immutable publication IDs.
      if (path.startsWith('/public/')) continue;
      for (const method of Object.keys(layer.route.methods)) routes.push(`${method.toUpperCase()} ${route}`);
    }
  }
  return routes.sort();
}
function send(route: string, id: string, token: string) {
  const [method, path] = route.split(' ') as [string, string];
  const call = request(app)[method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](`/api/v1${path.replace(':id', id)}`)
    .set('Authorization', token).set('Origin', 'http://localhost:3000');
  return method === 'GET' ? call : call.send(method === 'POST' ? { reason: 'Synthetic isolation boundary', idempotencyKey: randomUUID() } : {});
}
const withoutCorrelation = (body: unknown) => JSON.stringify(body).replace(/"requestId":"[^"]*"/g, '"requestId":""');
beforeEach(() => resetDatabase());

describe('global ID surfaces × every role', () => {
  it('inventories every private platform path ID, refusing an untested addition', () => {
    expect(privateIdInventory()).toEqual([...personRoutes, ...noticeRoutes, ...sessionRoutes].sort());
  });
  it.each(ROLE_IDS)('conceals foreign people, notices, sessions and private content IDs for %s', async (role) => {
    const scope = await testEvent();
    const actor = await createVolunteer({ email: `${role.toLowerCase()}@platform-isolation.test`, role });
    // An event Admin also has real platform standing in A; this still grants nothing in B.
    if (role === 'ADMIN') await makePlatformAdmin(actor.id);
    const ownEvent = await rawDb.event.findUniqueOrThrow({ where: { id: scope.eventId } });
    const organisation = await rawDb.organisation.create({ data: { slug: 'foreign-isolation', name: 'Foreign organisation',
      appName: 'Foreign', defaultTimezone: ownEvent.timezone } });
    const event = await rawDb.event.create({ data: { organisationId: organisation.id, slug: 'foreign-global',
      name: 'Foreign event', timezone: ownEvent.timezone } });
    const foreign = await rawDb.person.create({ data: { email: 'foreign-person@private.test',
      displayName: 'Foreign private person', cognitoSub: randomUUID() } });
    const member = await rawDb.eventMembership.create({ data: { eventId: event.id, personId: foreign.id } });
    const sameEventMember = await rawDb.eventMembership.create({ data: { eventId: scope.eventId, personId: foreign.id } });
    const notice = await rawDb.notice.create({ data: { eventId: event.id, recipientPersonId: foreign.id,
      recipientMembershipId: member.id, kind: 'ASSIGNMENT_REMOVED', priority: 'OPERATIONAL', sourceKind: 'ASSIGNMENT',
      sourceId: 'removed-assignment', transitionKey: 'removed-assignment:committed', context: { type: 'assignment', operation: 'REMOVED' } } });
    const peerNotice = await rawDb.notice.create({ data: { eventId: scope.eventId, recipientPersonId: foreign.id,
      recipientMembershipId: sameEventMember.id, kind: 'ASSIGNMENT_REMOVED', priority: 'OPERATIONAL', sourceKind: 'ASSIGNMENT',
      sourceId: 'same-event-removed', transitionKey: 'same-event:removed:committed', context: { type: 'assignment', operation: 'REMOVED' } } });
    const opened = await request(app).post('/api/v1/auth/session').set('Origin', 'http://localhost:3000')
      .send({ email: actor.email }).expect(201);
    const auth = `Bearer ${opened.body.accessToken as string}`;
    const session = await rawDb.refreshSession.create({ data: { volunteerId: foreign.id, familyId: randomUUID(),
      tokenHash: randomUUID(), issuedAt: FROZEN_NOW, expiresAt: new Date(FROZEN_NOW.getTime() + 60_000) } });
    for (const [routes, id] of [[personRoutes, foreign.id], [noticeRoutes, notice.id], [noticeRoutes, peerNotice.id], [sessionRoutes, session.id]] as const) {
      for (const route of routes) {
        const response = await send(route, id, auth);
        const missing = await send(route, 'missing-schema-valid-id', auth);
        expect(response.status, `${role} ${route}`).toBe(404);
        expect(missing.status, `${role} ${route}`).toBe(404);
        expect(withoutCorrelation(response.body), route).toBe(withoutCorrelation(missing.body));
      }
    }
    const notices = await request(app).get(`/api/v1/notification-centre?cursor=${notice.id}`).set('Authorization', auth);
    const noNotice = await request(app).get('/api/v1/notification-centre?cursor=missing-schema-valid-id').set('Authorization', auth);
    expect(notices.status).toBe(404);
    expect(noNotice.status).toBe(404);
    expect(withoutCorrelation(notices.body)).toBe(withoutCorrelation(noNotice.body));
    const devices = await request(app).get('/api/v1/auth/sessions').set('Authorization', auth).expect(200);
    expect(JSON.stringify(devices.body)).not.toContain(session.id);
    const publication = await insertContentPublicationFixture({ db: rawDb, eventId: event.id, personId: foreign.id, now: FROZEN_NOW });
    const own = await insertContentPublicationFixture({ db: rawDb, eventId: scope.eventId, personId: actor.id, now: FROZEN_NOW });
    await request(app).get(`/api/v1/events/${scope.eventId}/content?v=${own.id}`).set('Authorization', auth).expect(200);
    const draft = await rawDb.contentDocument.findUniqueOrThrow({ where: { eventId: scope.eventId } });
    for (const id of [publication.id, draft.id, 'missing-schema-valid-id']) {
      for (const path of [`/content?v=${id}`, `/content/assets/${id}/map-0`]) {
        await request(app).get(`/api/v1/events/${scope.eventId}${path}`).set('Authorization', auth).expect(404);
      }
    }
    expect((await rawDb.refreshSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt).toBeNull();
    expect((await rawDb.notice.findUniqueOrThrow({ where: { id: notice.id } })).readAt).toBeNull();
    expect(await rawDb.person.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign);
  });

  it('excludes every global audit row from an event feed, including foreign-organisation data', async () => {
    const scope = await testEvent();
    const admin = await createVolunteer({ email: 'audit-reader@isolation.test', role: 'ADMIN' });
    const foreignOrg = await rawDb.organisation.create({ data: { slug: 'audit-foreign', name: 'Foreign audit organisation',
      appName: 'Foreign', defaultTimezone: 'Asia/Singapore' } });
    const foreign = await rawDb.person.create({ data: { email: 'foreign-audit@private.test', displayName: 'Foreign actor', cognitoSub: randomUUID() } });
    await rawDb.organisationMembership.create({ data: { organisationId: foreignOrg.id, personId: foreign.id, role: 'PLATFORM_ADMIN' } });
    const global = await rawDb.auditLog.create({ data: { eventId: null, actorId: foreign.id, actorSub: foreign.cognitoSub,
      action: 'person.export', entityType: 'Person', entityId: foreign.id, after: { secret: 'foreign-organisation-sentinel' } } });
    const own = await rawDb.auditLog.create({ data: { eventId: scope.eventId, actorId: admin.id, actorSub: admin.sub,
      action: 'person.export', entityType: 'Person', entityId: admin.id, after: { own: true } } });
    for (const query of ['', `?actorId=${foreign.id}`, `?entityId=${foreign.id}`, '?action=person.export']) {
      const feed = await request(app).get(`/api/v1/events/${scope.eventId}/audit${query}`).set('Authorization', bearer(admin)).expect(200);
      expect(JSON.stringify(feed.body)).not.toMatch(/foreign-organisation-sentinel|foreign-audit@private/);
      expect(feed.body.data.map((row: { id: string }) => row.id)).not.toContain(global.id);
      if (query === '' || query === '?action=person.export') expect(feed.body.data.map((row: { id: string }) => row.id)).toContain(own.id);
      else expect(feed.body.data).toEqual([]);
    }
  });
});
