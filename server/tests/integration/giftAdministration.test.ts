import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

const app = createApp();
let actor: TestVolunteer;
let eventId: string;
const send = (path: string, body: object, method: 'post' | 'patch' = 'post') =>
  request(app)
    [method](`/api/v1/events/${eventId}${path}`)
    .set('Authorization', bearer(actor))
    .send(body);
beforeEach(async () => {
  await resetDatabase();
  eventId = (await testEvent()).eventId;
  actor = await createVolunteer({ email: 'stock@admin.test', role: 'ADMIN' });
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
});
it('replays gift creation, edits and stock correction without changing derived stock twice', async () => {
  const body = {
    name: 'Badge',
    initialStock: 20,
    lowStockThreshold: 4,
    idempotencyKey: idempotencyKey(),
  };
  const created = await send('/admin/gift-types', body);
  expect(created.status).toBe(201);
  expect((await send('/admin/gift-types', body)).body).toEqual(created.body);
  const id = created.body.giftType.id as string;
  const patch = { active: false, idempotencyKey: idempotencyKey() };
  expect((await send(`/admin/gift-types/${id}`, patch, 'patch')).status).toBe(200);
  expect((await send(`/admin/gift-types/${id}`, patch, 'patch')).status).toBe(200);
  const change = { delta: 5, reason: 'Delivery counted', idempotencyKey: idempotencyKey() };
  const adjusted = await send(`/gifts/${id}/stock`, change);
  expect(adjusted.status).toBe(200);
  expect(adjusted.body.giftType.remaining).toBe(25);
  expect((await send(`/gifts/${id}/stock`, change)).body).toEqual(adjusted.body);
  expect(await rawDb.giftStockAdjustment.count()).toBe(1);
  expect(await rawDb.auditLog.count({ where: { action: 'giftType.create' } })).toBe(1);
  expect(await rawDb.auditLog.count({ where: { action: 'giftType.update' } })).toBe(1);
  const catalogue = await request(app)
    .get(`/api/v1/events/${eventId}/gifts/catalogue`)
    .set('Authorization', bearer(actor));
  expect(catalogue.body.data).toEqual([
    expect.objectContaining({ id, active: false, remaining: 25 }),
  ]);
  const captureList = await request(app)
    .get(`/api/v1/events/${eventId}/gifts`)
    .set('Authorization', bearer(actor));
  expect(captureList.body.data).toEqual([]);
});
it('freezes new gift types and reactivation after go-live while keeping corrections available', async () => {
  const gift = await rawDb.giftType.create({
    data: { eventId, name: 'Badge', initialStock: 20, active: false },
  });
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
  expect((await send('/admin/gift-types', { name: 'New', initialStock: 0 })).status).toBe(409);
  expect((await send(`/admin/gift-types/${gift.id}`, { active: true }, 'patch')).status).toBe(409);
  expect(
    (await send(`/admin/gift-types/${gift.id}`, { name: 'Badge corrected' }, 'patch')).status,
  ).toBe(200);
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  expect((await send(`/admin/gift-types/${gift.id}`, { name: 'Too late' }, 'patch')).status).toBe(
    409,
  );
});
it('rejects empty receipt-only edits, duplicates and foreign gift ids', async () => {
  const body = { name: 'Badge', initialStock: 20 };
  const created = await send('/admin/gift-types', body);
  expect((await send('/admin/gift-types', body)).status).toBe(409);
  expect(
    (
      await send(
        `/admin/gift-types/${created.body.giftType.id}`,
        { idempotencyKey: idempotencyKey() },
        'patch',
      )
    ).status,
  ).toBe(400);
  expect((await send('/admin/gift-types/missing', { name: 'No such gift' }, 'patch')).status).toBe(
    404,
  );
});
