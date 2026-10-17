import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { AnnouncementRecord, ErrorBody, ERROR_CODES, NoticeListResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb } from '../helpers/db.js';
import { bearer, membershipOf } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';
const app = createApp();
let fixture: WorkspaceFixture, unackedId: string, allIds: string[];
beforeEach(async () => {
  fixture = await workspaceFixture();
  const member = await membershipOf(fixture.admin.id);
  const create = (body: string, requiresAck: boolean) =>
    rawDb.announcement.create({
      data: {
        eventId: fixture.eventId,
        authorId: fixture.admin.id,
        authorMembershipId: member.id,
        body,
        requiresAck,
        priority: 'INFO',
        createdAt: FROZEN_NOW,
      },
    });
  const plain = await create('Synthetic notice query: ordinary information', false),
    unacked = await create('Synthetic notice query: awaiting acknowledgement', true),
    acked = await create('Synthetic notice query: acknowledged information', true);
  unackedId = unacked.id;
  allIds = [plain.id, unacked.id, acked.id].sort();
  await rawDb.announcementAck.create({
    data: {
      eventId: fixture.eventId,
      announcementId: acked.id,
      volunteerId: fixture.admin.id,
      membershipId: member.id,
      ackedAt: FROZEN_NOW,
    },
  });
});
async function snapshot() {
  return {
    announcements: await rawDb.announcement.findMany({ orderBy: { id: 'asc' } }),
    acknowledgements: await rawDb.announcementAck.findMany({ orderBy: { id: 'asc' } }),
    notices: await rawDb.notice.findMany({ orderBy: { id: 'asc' } }),
    devices: await rawDb.noticeDelivery.findMany({ orderBy: { id: 'asc' } }),
    announcementDevices: await rawDb.announcementPushDelivery.findMany({ orderBy: { id: 'asc' } }),
    audits: await rawDb.auditLog.findMany({ orderBy: { id: 'asc' } }),
  };
}
const inbox = (form: string) =>
  form === 'scoped'
    ? '/api/v1/events/' + fixture.eventId + '/announcements'
    : '/api/v1/announcements';
async function get(path: string, query: Record<string, string | string[]> = {}) {
  return request(app).get(path).set('Authorization', bearer(fixture.admin)).query(query);
}
function ids(body: { data: unknown[] }) {
  return body.data.map((row) => AnnouncementRecord.parse(row).id).sort();
}
it.each(['scoped', 'alias'])(
  '%s false query preserves the complete personalised announcement inbox',
  async (form) => {
    const omitted = await get(inbox(form));
    expect(omitted.status).toBe(200);
    expect(ids(omitted.body)).toEqual(allIds);
    const only = await get(inbox(form), { unackedOnly: 'true' });
    expect(only.status).toBe(200);
    expect(ids(only.body)).toEqual([unackedId]);
    const before = await snapshot(),
      all = await get(inbox(form), { unackedOnly: 'false' });
    expect(all.status).toBe(200);
    expect(ids(all.body)).toEqual(allIds);
    expect(await snapshot()).toEqual(before);
  },
);
const invalidBoolean = [
  'TRUE',
  'FALSE',
  'yes',
  'no',
  '1',
  '0',
  'null',
  '',
  ' true',
  'false ',
  ['true', 'true'],
  ['false', 'true'],
];
it.each(['scoped', 'alias'])(
  '%s refuses malformed and repeated unackedOnly flags without changing rows',
  async (form) => {
    expect((await get(inbox(form))).status).toBe(200);
    const before = await snapshot();
    for (const value of invalidBoolean) {
      const response = await get(inbox(form), { unackedOnly: value });
      expect(response.status, JSON.stringify(value)).toBe(400);
      expect(ErrorBody.parse(response.body).error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(response.headers['cache-control']?.split(',').map((v: string) => v.trim())).toContain(
        'no-store',
      );
    }
    expect(await snapshot()).toEqual(before);
  },
);
it('notice-centre materialises current history once; strict query failures preserve notices, audits and device rows', async () => {
  const base = '/api/v1/notification-centre',
    first = await get(base, { eventId: fixture.eventId });
  expect(first.status).toBe(200);
  const original = NoticeListResponse.parse(first.body);
  expect(original.data).toHaveLength(3);
  expect(await rawDb.notice.count()).toBe(3);
  expect(await rawDb.noticeDelivery.count()).toBe(0);
  expect(await rawDb.announcementPushDelivery.count()).toBe(0);
  expect(await rawDb.auditLog.count({ where: { action: 'notification.materialise' } })).toBe(3);
  const afterMaterialisation = await snapshot(),
    again = await get(base, { eventId: fixture.eventId });
  expect(again.status).toBe(200);
  NoticeListResponse.parse(again.body);
  expect(await snapshot()).toEqual(afterMaterialisation);
  await rawDb.notice.update({ where: { id: original.data[0]!.id }, data: { readAt: FROZEN_NOW } });
  for (const [unreadOnly, count] of [
    ['true', 2],
    ['false', 3],
  ] as const) {
    const page = await get(base, { eventId: fixture.eventId, unreadOnly });
    expect(page.status).toBe(200);
    expect(NoticeListResponse.parse(page.body).data).toHaveLength(count);
    expect(page.headers['cache-control']).toBe('private, no-store');
  }
  const before = await snapshot(),
    invalid: Array<Record<string, string | string[]>> = [
      ...invalidBoolean.map((unreadOnly) => ({ eventId: fixture.eventId, unreadOnly })),
      ...['0', '201', '-1', '1.5', 'NaN', 'true', 'null', ''].map((limit) => ({
        eventId: fixture.eventId,
        limit,
      })),
      { eventId: fixture.eventId, limit: ['1', '1'] },
      { eventId: fixture.eventId, cursor: '' },
      { eventId: fixture.eventId, cursor: 'x'.repeat(65) },
      { eventId: fixture.eventId, cursor: ['a', 'a'] },
      { eventId: '' },
      { eventId: 'x'.repeat(65) },
      { eventId: [fixture.eventId, fixture.eventId] },
      { eventId: fixture.eventId, unexpected: 'true' },
    ];
  for (const query of invalid) {
    const response = await get(base, query);
    expect(response.status, JSON.stringify(query)).toBe(400);
    expect(ErrorBody.parse(response.body).error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(response.headers['cache-control']).toBe('private, no-store');
  }
  expect(await snapshot()).toEqual(before);
});
