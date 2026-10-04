import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { prisma } from '../../src/platform/db/client.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent } from '../helpers/fixtures.js';

/**
 * Upload auditing (F03-018). S3 is not configured in tests, so the adapter is
 * replaced with one that signs nothing: what is under test is the use case.
 */
vi.mock('../../src/modules/media/application/s3.js', () => ({
  mediaEnabled: () => true,
  assertConfigured: () => undefined,
  presignUpload: () => Promise.resolve({ url: 'https://bucket.test/upload', fields: {} }),
  presignRead: () => Promise.resolve('https://bucket.test/read'),
}));

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('media uploads', () => {
  // F03-018
  it('audits an issued upload policy under media.upload, with its key', async () => {
    const desk = await createVolunteer({ email: 'desk@media.test', role: 'VOLUNTEER' });

    const response = await request(app)
      .post('/api/v1/media/uploads')
      .set('Authorization', bearer(desk))
      .send({
        idempotencyKey: randomUUID(),
        purpose: 'lostFound',
        contentType: 'image/jpeg',
        contentLength: 1000,
      });

    expect(response.status).toBe(201);
    const entry = await prisma.auditLog.findFirst({ where: { actorId: desk.id } });
    expect(entry?.action).toBe('media.upload');
    expect(entry?.entityId).toBe(response.body.key);
  });

  it('applies live platform upload limits for the event organisation', async () => {
    const desk = await createVolunteer({ email: 'desk-limits@media.test', role: 'VOLUNTEER' });
    const { eventId } = await testEvent();
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    await rawDb.setting.createMany({
      data: [
        {
          scope: 'PLATFORM',
          scopeId: event.organisationId,
          key: 'media.maxUploadBytes',
          value: 1500,
          version: 1,
        },
        {
          scope: 'PLATFORM',
          scopeId: event.organisationId,
          key: 'media.uploadTtlSeconds',
          value: 120,
          version: 1,
        },
      ],
    });
    const send = (contentLength: number) =>
      request(app).post('/api/v1/media/uploads').set('Authorization', bearer(desk)).send({
        idempotencyKey: randomUUID(),
        purpose: 'lostFound',
        contentType: 'image/jpeg',
        contentLength,
      });
    expect((await send(2000)).status).toBe(400);
    const accepted = await send(1000);
    expect(accepted.status).toBe(201);
    expect(accepted.body).toMatchObject({ maxBytes: 1500, expiresIn: 120 });
  });
});
