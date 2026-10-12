import sharp from 'sharp';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrandingState, PublicBranding } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { prisma } from '../../src/platform/db/client.js';
import type { ActorContext } from '../../src/platform/http/auditContext.js';
import { cloneBrandingInto, freezeBranding, readFrozenBrandingLogo } from '../../src/modules/branding/index.js';
import { publishBranding } from '../../src/modules/branding/application/publish.js';
import { saveBrandingDraft } from '../../src/modules/branding/application/saveDraft.js';
import { imageDigest, useBrandingStorage, type BrandingStorage } from '../../src/modules/branding/application/storage.js';
import { readRegistry } from '../../src/modules/branding/domain/registry.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, idempotencyKey, testEvent, type TestVolunteer } from '../helpers/fixtures.js';

const app = createApp();
let eventId: string;
let admin: TestVolunteer;
let member: TestVolunteer;
let actor: ActorContext;
let logo: Uint8Array;
let restore: () => void;
const objects = new Map<string, Uint8Array>();
const storage: BrandingStorage = {
  issue: vi.fn(async () => ({ url: 'https://uploads.example.test', fields: { policy: 'synthetic-signed-policy' } })),
  uploaded: vi.fn(async () => logo),
  put: vi.fn(async ({ prefix, images }: Parameters<BrandingStorage['put']>[0]) => {
    return images.map((image) => {
      const key = `${prefix}/${image.variant}.png`;
      if (objects.has(key)) throw new Error('Conditional write conflict');
      objects.set(key, image.body);
      return { key, variant: image.variant, versionId: 'saved-version', sha256: imageDigest(image.body), bytes: image.body.length };
    });
  }),
  read: vi.fn(async (asset) => {
    const body = objects.get(asset.key);
    if (!body || imageDigest(body) !== asset.sha256) throw new Error('Missing or changed asset');
    return body;
  }),
};
const get = (path = '', caller = admin) => request(app).get(`/api/v1/events/${eventId}/branding${path}`).set('Authorization', bearer(caller));
const write = (path: string, body: object, method: 'post' | 'put' = 'post', caller = admin) => request(app)[method](`/api/v1/events/${eventId}/branding${path}`).set('Authorization', bearer(caller)).send(body);
const save = (body = { accent: '#0066cc', logoAlt: null as string | null, uploadReceiptId: null as string | null }, expectedVersion = 0, key = idempotencyKey()) => write('/draft', { body, expectedVersion, idempotencyKey: key }, 'put');
const publish = (version = 1, key = idempotencyKey()) => write('/publish', { expectedVersion: version, idempotencyKey: key });
const publicGet = (path = '') => request(app).get(`/api/v1/public/events/test-event/branding${path}`);
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'branding-admin@brand.test', role: 'ADMIN' });
  member = await createVolunteer({ email: 'branding-member@brand.test', role: 'VOLUNTEER' });
  const membership = await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: admin.id } });
  actor = { volunteerId: admin.id, membershipId: membership.id, scope: { eventId }, audit: { eventId, actorId: admin.id, actorSub: admin.sub, membershipId: membership.id, ip: null, userAgent: null, requestId: null } };
  logo = await sharp({ create: { width: 90, height: 30, channels: 4, background: '#0066cc' } }).png().toBuffer();
  objects.clear();
  vi.clearAllMocks();
  restore = useBrandingStorage(storage);
});
afterEach(() => restore());
async function uploadedDraft() {
  const key = idempotencyKey();
  const body = { idempotencyKey: key, expectedVersion: 0, contentType: 'image/png', contentLength: logo.length };
  const upload = await write('/images/upload', body);
  expect(upload.status).toBe(201);
  expect((await write('/images/upload', body)).body.data.receiptId).toBe(upload.body.data.receiptId);
  expect((await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } })).responseBody).toEqual({ receiptId: upload.body.data.receiptId });
  expect((await save({ accent: '#8844aa', logoAlt: 'Synthetic mark', uploadReceiptId: upload.body.data.receiptId })).status).toBe(200);
  return upload.body.data.receiptId as string;
}
async function reservation(endpoint: string) {
  const key = idempotencyKey();
  await rawDb.idempotencyRecord.create({ data: { key, eventId, actorSub: admin.sub, endpoint, statusCode: 0, responseBody: {} } });
  return key;
}
it('publishes minimal identity only after explicit approval, with exact replays and private drafts', async () => {
  expect((await publicGet()).status).toBe(404);
  expect((await get('', member)).status).toBe(403);
  const key = idempotencyKey();
  const saved = await save(undefined, 0, key);
  expect(saved.status).toBe(200);
  expect(BrandingState.parse(saved.body.data).version).toBe(1);
  expect((await save(undefined, 0, key)).body).toEqual(saved.body);
  expect((await publicGet()).status).toBe(404);
  const publishedKey = idempotencyKey();
  const published = await publish(1, publishedKey);
  expect(published.status).toBe(200);
  expect((await publish(1, publishedKey)).body).toEqual(published.body);
  const response = await publicGet();
  expect(response.status).toBe(200);
  expect(PublicBranding.parse(response.body.data).name).toBe('Test Event');
  for (const field of ['eventId', 'organisationId', 'draft', 'status', 'objectKey']) expect(response.body.data).not.toHaveProperty(field);
  expect((await publicGet().set('If-None-Match', response.headers.etag!)).status).toBe(304);
  expect((await get()).headers['cache-control']).toBe('no-store');
  expect(await rawDb.auditLog.count({ where: { eventId, action: 'branding.publish' } })).toBe(1);
});
it('rejects stale versions, strict extra fields and pending/foreign object references', async () => {
  await save();
  expect((await save(undefined, 0)).status).toBe(409);
  expect((await publish(99)).status).toBe(409);
  expect((await save({ accent: '#0066cc', logoAlt: 'Foreign mark', uploadReceiptId: 'foreign' }, 1)).status).toBe(404);
  expect((await write('/draft', { idempotencyKey: idempotencyKey(), expectedVersion: 1, body: { accent: '#0066cc', logoAlt: null, uploadReceiptId: null, css: 'unsafe' } }, 'put')).status).toBe(400);
  const guideReceipt = await rawDb.contentUploadReceipt.create({ data: { id: idempotencyKey(), createdAt: new Date(), eventId, issuedByPersonId: admin.id, key: `drafts/${eventId}/guide-image`, contentType: 'image/png', contentLength: logo.length } });
  expect((await save({ accent: '#0066cc', logoAlt: 'Guide image', uploadReceiptId: guideReceipt.id }, 1)).status).toBe(404);
  expect(storage.uploaded).not.toHaveBeenCalled();
});
it('normalizes preview bytes and exposes only committed exact approved variants', async () => {
  await uploadedDraft();
  expect((await get('/draft/assets/icon-192')).status).toBe(200);
  expect((await publicGet('/assets/pending/logo')).status).toBe(404);
  const result = await publish();
  const brand = result.body.data.published;
  const asset = await publicGet(`/assets/${brand.publicationId}/logo`);
  expect(asset.status).toBe(200);
  expect(asset.headers).toMatchObject({ 'content-type': 'image/png', 'cross-origin-resource-policy': 'cross-origin', 'x-content-type-options': 'nosniff' });
  expect(asset.headers['cache-control']).toContain('immutable');
  expect((await publicGet(`/assets/${brand.publicationId}/logo`).set('If-None-Match', asset.headers.etag!)).status).toBe(304);
  expect((await publicGet('/assets/foreign/logo')).status).toBe(404);
  expect((await publicGet(`/assets/${brand.publicationId}/private`)).status).toBe(400);
  const css = await publicGet(`/theme.css?v=${brand.publicationId}`);
  expect(css.headers['cache-control']).toContain('immutable');
  expect(css.text).not.toContain('url(');
});
it('changes the public name/ETag after rename while frozen assets and identity stay historical', async () => {
  await uploadedDraft();
  await publish();
  const frozen = await prisma.$transaction((tx) => freezeBranding({ eventId }, tx));
  const oldBytes = await readFrozenBrandingLogo({ eventId }, frozen);
  const first = await publicGet();
  await rawDb.event.update({ where: { id: eventId }, data: { name: 'Renamed <event>' } });
  expect((await publicGet()).body.data.name).toBe('Renamed <event>');
  expect((await publicGet()).headers.etag).not.toBe(first.headers.etag);
  const state = (await get()).body.data;
  await save({ accent: '#00aa00', logoAlt: null, uploadReceiptId: null }, state.version);
  await publish(state.version + 1);
  expect(await readFrozenBrandingLogo({ eventId }, frozen)).toEqual(oldBytes);
  await expect(readFrozenBrandingLogo({ eventId }, { ...frozen, publicationId: 'foreign', logo: frozen.logo ? { ...frozen.logo, publicationId: 'foreign' } : null })).rejects.toThrow();
  expect(await readFrozenBrandingLogo({ eventId }, undefined)).toBeNull();
});
it('refuses ambiguous exact slugs even when only one candidate is published', async () => {
  await save(); await publish();
  const org = await rawDb.organisation.create({ data: { name: 'Other organisation', slug: 'other-brand-org', appName: 'Other ops', defaultTimezone: 'UTC' } });
  await rawDb.event.create({ data: { organisationId: org.id, slug: 'test-event', name: 'Unpublished other', timezone: 'UTC' } });
  expect((await publicGet()).status).toBe(404);
  expect((await publicGet('/theme.css')).status).toBe(404);
  expect((await request(app).get('/api/v1/public/events/not-found/branding')).status).toBe(404);
});
it('copies approved source appearance into fresh target draft assets and never publishes the clone implicitly', async () => {
  await uploadedDraft(); await publish();
  const source = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const target = await rawDb.event.create({ data: { organisationId: source.organisationId, name: 'Different event', slug: 'different-brand', timezone: source.timezone } });
  await prisma.$transaction((tx) => cloneBrandingInto(tx, { sourceScope: { eventId }, targetScope: { eventId: target.id }, copySettings: true }));
  const cloned = readRegistry((await rawDb.event.findUniqueOrThrow({ where: { id: target.id } })).branding);
  expect(cloned).toMatchObject({ version: 1, publishedId: null, publications: [], draft: { accent: '#8844aa' } });
  expect(cloned.draftAssets?.every((item) => item.key.startsWith(`drafts/${target.id}/`))).toBe(true);
  expect((await request(app).get('/api/v1/public/events/different-brand/branding')).status).toBe(404);
  expect((await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).branding).toEqual(source.branding);
  await prisma.$transaction((tx) => cloneBrandingInto(tx, { sourceScope: { eventId }, targetScope: { eventId: target.id }, copySettings: false }));
  expect(readRegistry((await rawDb.event.findUniqueOrThrow({ where: { id: target.id } })).branding).draft.accent).toBe('#0066cc');
});
it('rolls back approval, audit and success receipt after successful object writes but SQL failure', async () => {
  await uploadedDraft();
  const key = await reservation('POST /branding/publish');
  const invalidAudit = { ...actor, audit: { ...actor.audit, actorId: 'missing-audit-person' } };
  await expect(publishBranding({ expectedVersion: 1, idempotencyKey: key }, invalidAudit)).rejects.toThrow();
  expect([...objects.keys()].some((name) => name.startsWith('content/'))).toBe(true);
  expect((await publicGet()).status).toBe(404);
  expect(readRegistry((await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).branding).publications).toHaveLength(0);
  expect((await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key } })).statusCode).toBe(0);
  expect(await rawDb.auditLog.count({ where: { action: 'branding.publish' } })).toBe(0);
});
it.each(['role', 'inactive', 'archive'])('rechecks current %s under canonical mutation locks', async (change) => {
  const key = await reservation('PUT /branding/draft');
  if (change === 'role') await rawDb.eventMembership.update({ where: { id: actor.membershipId }, data: { role: 'VOLUNTEER' } });
  if (change === 'inactive') await rawDb.eventMembership.update({ where: { id: actor.membershipId }, data: { status: 'ENDED' } });
  if (change === 'archive') await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
  await expect(saveBrandingDraft({ idempotencyKey: key, expectedVersion: 0, body: { accent: '#0066cc', logoAlt: null, uploadReceiptId: null } }, actor)).rejects.toThrow();
  expect(await rawDb.auditLog.count({ where: { action: 'branding.draft' } })).toBe(0);
});
