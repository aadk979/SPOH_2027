import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, testEvent } from '../helpers/fixtures.js';
import { insertContentPublicationFixture } from '../helpers/content.js';
import { FROZEN_NOW } from '../setup.js';

let eventId: string;
let organisationId: string;
let personId: string;
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  ({ organisationId } = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } }));
  personId = (await createVolunteer({ email: 'sql-boundary@example.test', role: 'ADMIN' })).id;
});
const operation = () => rawDb.identityAccountOperation.create({ data: { id: randomUUID(),
  organisationId, actorPersonId: personId, plannedPersonId: personId, personId,
  targetPoolId: 'ap-southeast-1_storage', emailDigest: 'a'.repeat(64), profileDigest: 'b'.repeat(64),
  generation: randomUUID(), createdAt: FROZEN_NOW, updatedAt: FROZEN_NOW,
  leaseExpiresAt: new Date(FROZEN_NOW.getTime() + 60_000) } });

it('enforces account intent, provider stages, exact invitation binding and terminal immutability in SQL', async () => {
  const account = await operation();
  await expect(rawDb.identityAccountOperation.update({ where: { id: account.id }, data: { profileDigest: 'c'.repeat(64) } })).rejects.toBeDefined();
  await expect(rawDb.identityAccountOperation.update({ where: { id: account.id }, data: { state: 'PROVIDER_READY' } })).rejects.toBeDefined();
  await expect(rawDb.identityAccountOperation.update({ where: { id: account.id }, data: { state: 'BOUND',
    providerSubject: 'proof', providerUsername: 'proof', boundAt: FROZEN_NOW } })).rejects.toBeDefined();
  const invitation = { id: randomUUID(), organisationId, actorPersonId: personId, personId,
    targetPoolId: account.targetPoolId, accountId: account.id, requestDigest: 'd'.repeat(64), startedAt: FROZEN_NOW };
  await expect(rawDb.identityInvitationAttempt.create({ data: invitation })).rejects.toBeDefined();
  await rawDb.identityAccountOperation.update({ where: { id: account.id }, data: { state: 'PROVIDER_READY',
    providerSubject: 'proof', providerUsername: 'proof' } });
  await expect(rawDb.identityAccountOperation.update({ where: { id: account.id }, data: { state: 'CREATE_STARTED' } })).rejects.toBeDefined();
  await expect(rawDb.identityAccountOperation.update({ where: { id: account.id }, data: { providerSubject: 'replacement' } })).rejects.toBeDefined();
  await rawDb.identityAccountOperation.update({ where: { id: account.id }, data: { state: 'BOUND', boundAt: FROZEN_NOW } });
  await expect(rawDb.identityAccountOperation.update({ where: { id: account.id }, data: { generation: randomUUID() } })).rejects.toBeDefined();
  await expect(rawDb.identityInvitationAttempt.create({ data: { ...invitation, targetPoolId: 'different-pool' } })).rejects.toBeDefined();
  await rawDb.identityInvitationAttempt.create({ data: invitation });
  await expect(rawDb.identityInvitationAttempt.update({ where: { id: invitation.id }, data: { state: 'ACCEPTED' } })).rejects.toBeDefined();
  await rawDb.identityInvitationAttempt.update({ where: { id: invitation.id }, data: { state: 'DELIVERY_UNKNOWN', finishedAt: FROZEN_NOW } });
  await expect(rawDb.identityInvitationAttempt.update({ where: { id: invitation.id }, data: { state: 'ACCEPTED' } })).rejects.toBeDefined();
  await rawDb.identityInvitationAttempt.delete({ where: { id: invitation.id } });
  await rawDb.identityAccountOperation.delete({ where: { id: account.id } });
});

it('requires immutable valid raster proof while retaining explicit privacy deletion', async () => {
  const data = { id: randomUUID(), eventId, issuedByPersonId: personId, key: `lost-found/${eventId}/original.jpg`,
    purpose: 'lostFound', rehearsal: false, sourceEtag: '"source"', objectKey: `lost-found/${eventId}/validated.png`,
    contentType: 'image/png', contentLength: 20, sha256: 'a'.repeat(64), createdAt: FROZEN_NOW };
  await expect(rawDb.validatedMedia.create({ data: { ...data, contentType: 'image/svg+xml' } })).rejects.toBeDefined();
  await expect(rawDb.validatedMedia.create({ data: { ...data, contentLength: 0 } })).rejects.toBeDefined();
  await expect(rawDb.validatedMedia.create({ data: { ...data, sha256: 'invalid' } })).rejects.toBeDefined();
  await rawDb.validatedMedia.create({ data });
  await expect(rawDb.validatedMedia.update({ where: { id: data.id }, data: { objectKey: 'replacement' } })).rejects.toBeDefined();
  await rawDb.validatedMedia.delete({ where: { id: data.id } });
});

it('protects frozen manifests and rejects unsafe storage-intent array/deadline bounds', async () => {
  const version = await insertContentPublicationFixture({ db: rawDb, eventId, personId, now: FROZEN_NOW });
  await expect(rawDb.contentVersion.update({ where: { id: version.id }, data: { imageManifest: [{ key: 'replacement' }] } })).rejects.toBeDefined();
  const intent = { id: randomUUID(), eventId, targetEventId: randomUUID(), contentVersionId: randomUUID(),
    objectKeys: ['drafts/planned/exact-key'], createdAt: FROZEN_NOW, cleanupAfter: new Date(FROZEN_NOW.getTime() + 3600_000) };
  await expect(rawDb.contentStorageIntent.create({ data: { ...intent, cleanupAfter: FROZEN_NOW } })).rejects.toBeDefined();
  await expect(rawDb.contentStorageIntent.create({ data: { ...intent, objectKeys: Array.from({ length: 257 }, () => 'key') } })).rejects.toBeDefined();
  await rawDb.contentStorageIntent.create({ data: intent });
  await expect(rawDb.$executeRaw`UPDATE "ContentStorageIntent" SET "objectKeys" = ARRAY[NULL]::text[] WHERE id = ${intent.id}::uuid`).rejects.toBeDefined();
  expect(await rawDb.contentStorageIntent.findUniqueOrThrow({ where: { id: intent.id } })).toMatchObject(intent);
});

it('stores quotas unlogged and rejects malformed digests, negative counts and invalid windows', async () => {
  const [table] = await rawDb.$queryRaw<{ relpersistence: string }[]>`SELECT relpersistence::text FROM pg_class WHERE oid = '"RateLimitCounter"'::regclass`;
  expect(table?.relpersistence).toBe('u');
  const data = { namespace: 'sql-test', scopeDigest: 'a'.repeat(64), subjectDigest: 'b'.repeat(64),
    generation: randomUUID(), windowStart: FROZEN_NOW, expiresAt: new Date(FROZEN_NOW.getTime() + 60_000) };
  await expect(rawDb.rateLimitCounter.create({ data: { ...data, count: -1 } })).rejects.toBeDefined();
  await expect(rawDb.rateLimitCounter.create({ data: { ...data, subjectDigest: 'invalid' } })).rejects.toBeDefined();
  await expect(rawDb.rateLimitCounter.create({ data: { ...data, expiresAt: FROZEN_NOW } })).rejects.toBeDefined();
  await rawDb.rateLimitCounter.create({ data });
});
