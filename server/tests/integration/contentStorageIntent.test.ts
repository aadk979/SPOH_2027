import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanupContentStorage } from '../../src/modules/content/application/cleanupStorage.js';
import { publishContentInTransaction } from '../../src/modules/content/application/publishContent.js';
import { planPublication, type ContentStoragePlan } from '../../src/modules/content/application/storagePlan.js';
import { useContentStorage, type ContentStorage } from '../../src/modules/content/application/storage.js';
import type { ContentActor } from '../../src/modules/content/application/prepare.js';
import * as audit from '../../src/platform/audit/index.js';
import { prisma } from '../../src/platform/db/client.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { guideContent } from '../helpers/content.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let actor: ContentActor;
let eventId: string;
let restore: () => void;
const objects = new Set<string>();
const storage: ContentStorage = {
  issueImage: vi.fn(async () => ({ url: 'https://unused.test', fields: {} })),
  copyImage: vi.fn(async ({ key }) => ({ key, contentType: 'image/png', contentLength: 20 })),
  read: vi.fn(async () => ({ body: Buffer.from('unused'), contentType: 'image/png' })),
  publish: vi.fn(async ({ id, eventId: target, body }) => {
    const objectKey = `content/${target}/${id}.json`;
    objects.add(objectKey);
    return { body, objectKey, etag: '"immutable"', imageManifest: [] };
  }),
  deleteObject: vi.fn(async (key) => { objects.delete(key); }),
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
const cleanup = (now: Date) => prisma.$transaction((tx) =>
  cleanupContentStorage(tx, { now, audit: SYSTEM_AUDIT_CONTEXT }), { timeout: 15_000 });
const publish = (plan: ContentStoragePlan) => prisma.$transaction((tx) =>
  publishContentInTransaction(tx, { actor, expectedVersion: 1, intentId: plan.id }), { timeout: 15_000 });

beforeEach(async () => {
  await resetDatabase();
  objects.clear(); vi.clearAllMocks();
  ({ eventId } = await testEvent());
  const admin = await createVolunteer({ email: 'content-intent-admin@test.invalid', role: 'ADMIN' });
  const member = await rawDb.eventMembership.findUniqueOrThrow({ where: {
    eventId_personId: { eventId, personId: admin.id },
  } });
  actor = { scope: { eventId }, volunteerId: admin.id, membershipId: member.id,
    audit: { ...SYSTEM_AUDIT_CONTEXT, actorId: admin.id, actorSub: admin.sub, eventId, membershipId: member.id } };
  await rawDb.contentDocument.create({ data: { eventId, body: guideContent(), version: 1,
    reviewedVersion: 1, reviewedAt: FROZEN_NOW, reviewedByPersonId: admin.id, updatedByPersonId: admin.id, updatedAt: FROZEN_NOW } });
  restore = useContentStorage(storage);
});
afterEach(() => { restore(); vi.restoreAllMocks(); });

it('commits the cleanup plan before a held storage write and retires bytes after an audited SQL rollback', async () => {
  const plan = await planPublication({ actor, expectedVersion: 1 });
  const entered = deferred(); const release = deferred();
  vi.mocked(storage.publish).mockImplementationOnce(async ({ id, eventId: target, body }) => {
    const objectKey = `content/${target}/${id}.json`;
    objects.add(objectKey); entered.resolve(); await release.promise;
    return { body, objectKey, etag: '"immutable"', imageManifest: [] };
  });
  vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Synthetic audit outage'));
  const running = publish(plan);
  // Attach the rejection observer before releasing the deliberately held adapter.
  const failed = expect(running).rejects.toThrow('Synthetic audit outage');
  await entered.promise;
  try {
    expect(await rawDb.contentStorageIntent.findUniqueOrThrow({ where: { id: plan.id } }))
      .toMatchObject({ eventId, objectKeys: plan.objectKeys });
    expect(await rawDb.contentVersion.count({ where: { eventId } })).toBe(0);
    expect(objects.has(plan.objectKeys[0]!)).toBe(true);
  } finally { release.resolve(); }
  await failed;
  expect(await cleanup(new Date(FROZEN_NOW.getTime() + 3600_000 - 1))).toBe(0);
  expect(storage.deleteObject).not.toHaveBeenCalled();
  expect(await cleanup(new Date(FROZEN_NOW.getTime() + 3600_000))).toBe(1);
  expect(objects.size).toBe(0);
  expect(await rawDb.contentStorageIntent.count({ where: { id: plan.id } })).toBe(0);
  expect(await rawDb.auditLog.count({ where: { action: 'content.publish' } })).toBe(0);
});

it('protects a committed publication and its frozen image receipt when the crash lease expires', async () => {
  const plan = await planPublication({ actor, expectedVersion: 1 });
  await publish(plan);
  const imageKey = `content/${eventId}/${plan.contentVersionId}/map-0`;
  // Fixture an independently committed historical publication to prove manifest-based protection.
  const historicalId = randomUUID();
  const historicalKey = `content/${eventId}/${historicalId}.json`;
  await rawDb.contentVersion.create({ data: { id: historicalId, eventId, version: 2, draftVersion: 1,
    body: guideContent(), objectKey: historicalKey, etag: '"history"', publishedAt: FROZEN_NOW,
    publishedByPersonId: actor.volunteerId, imageManifest: [{ schemaVersion: 1, key: imageKey,
      contentType: 'image/png', contentLength: 20, sha256: 'a'.repeat(64), sourceEtag: '"source"',
      sourceVersionId: 'source/version', objectVersionId: 'frozen/version' }] } });
  await rawDb.contentStorageIntent.update({ where: { id: plan.id }, data: { objectKeys: [...plan.objectKeys, imageKey] } });
  objects.add(imageKey);
  expect(await cleanup(new Date(FROZEN_NOW.getTime() + 3600_000))).toBe(0);
  expect(storage.deleteObject).not.toHaveBeenCalled();
  expect(objects).toEqual(new Set([...plan.objectKeys, imageKey]));
  expect(await rawDb.contentStorageIntent.count({ where: { id: plan.id } })).toBe(0);
});

async function arrangeIntent(count: number, targetEventId: string = randomUUID()) {
  const id = randomUUID();
  const objectKeys = Array.from({ length: count }, () => `drafts/${targetEventId}/${randomUUID()}`);
  for (const key of objectKeys) objects.add(key);
  return rawDb.contentStorageIntent.create({ data: { id, eventId, targetEventId,
    contentVersionId: randomUUID(), objectKeys, createdAt: new Date(FROZEN_NOW.getTime() - 3600_000), cleanupAfter: FROZEN_NOW } });
}
it('bounds each cleanup run, discovers absent clone targets and retains failed deletes for retry', async () => {
  const intent = await arrangeIntent(8);
  expect(await cleanup(FROZEN_NOW)).toBe(6);
  expect((await rawDb.contentStorageIntent.findUniqueOrThrow({ where: { id: intent.id } })).objectKeys).toEqual(intent.objectKeys.slice(6));
  vi.mocked(storage.deleteObject!).mockRejectedValueOnce(new Error('Synthetic storage outage'));
  await expect(cleanup(FROZEN_NOW)).rejects.toThrow('Synthetic storage outage');
  expect((await rawDb.contentStorageIntent.findUniqueOrThrow({ where: { id: intent.id } })).objectKeys).toEqual(intent.objectKeys.slice(6));
  expect(await rawDb.auditLog.count({ where: { action: 'content.storage.prune' } })).toBe(1);
  expect(await cleanup(FROZEN_NOW)).toBe(2);
  expect(objects.size).toBe(0);
  expect(await rawDb.contentStorageIntent.count({ where: { id: intent.id } })).toBe(0);
});

it('checks a committed clone target upload receipt across the source-owned cleanup intent', async () => {
  const source = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const target = await rawDb.event.create({ data: { organisationId: source.organisationId,
    name: 'Committed clone', slug: 'intent-committed-clone', timezone: source.timezone } });
  const intent = await arrangeIntent(2, target.id);
  await rawDb.contentUploadReceipt.create({ data: { id: randomUUID(), eventId: target.id, key: intent.objectKeys[0]!,
    issuedByPersonId: actor.volunteerId, contentType: 'image/png', contentLength: 20, createdAt: FROZEN_NOW } });
  expect(await cleanup(FROZEN_NOW)).toBe(1);
  expect(storage.deleteObject).toHaveBeenCalledExactlyOnceWith(intent.objectKeys[1]);
  expect(objects).toEqual(new Set([intent.objectKeys[0]!]));
});

it('refuses expired, changed and newly unauthorized plans before any storage write', async () => {
  const plan = await planPublication({ actor, expectedVersion: 1 });
  actor = { ...actor, clock: { now: () => new Date(FROZEN_NOW.getTime() + 3600_000) } };
  await expect(publish(plan)).rejects.toMatchObject({ statusCode: 409 });
  actor = { ...actor, clock: { now: () => FROZEN_NOW } };
  await rawDb.contentDocument.update({ where: { eventId }, data: { version: 2,
    reviewedVersion: null, reviewedAt: null, reviewedByPersonId: null } });
  await expect(publish(plan)).rejects.toMatchObject({ statusCode: 409 });
  await rawDb.contentDocument.update({ where: { eventId }, data: { version: 1,
    reviewedVersion: 1, reviewedAt: FROZEN_NOW, reviewedByPersonId: actor.volunteerId } });
  await rawDb.eventMembership.update({ where: { eventId_id: { eventId, id: actor.membershipId } }, data: { status: 'DEACTIVATED' } });
  await expect(publish(plan)).rejects.toMatchObject({ statusCode: 403 });
  expect(storage.publish).not.toHaveBeenCalled();
});

it('refuses an exact-key journal corrupted with a foreign object rather than deleting it', async () => {
  const intent = await arrangeIntent(1);
  await rawDb.contentStorageIntent.update({ where: { id: intent.id }, data: { objectKeys: ['content/foreign/foreign.json'] } });
  await expect(cleanup(FROZEN_NOW)).rejects.toMatchObject({ statusCode: 400 });
  expect(storage.deleteObject).not.toHaveBeenCalled();
  expect(await rawDb.contentStorageIntent.count({ where: { id: intent.id } })).toBe(1);
});
