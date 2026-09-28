import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/platform/db/client.js';
import { resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer } from '../helpers/fixtures.js';

/**
 * Upload auditing (F03-018). S3 is not configured in tests, so the adapter is
 * replaced with one that signs nothing: what is under test is the use case.
 */
vi.mock('../../src/modules/media/application/s3.js', () => ({
  mediaEnabled: () => true,
  assertConfigured: () => undefined,
  maxUploadBytes: () => 5_000_000,
  uploadTtlSeconds: () => 300,
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
      .send({ purpose: 'lostFound', contentType: 'image/jpeg', contentLength: 1000 });

    expect(response.status).toBe(201);
    const entry = await prisma.auditLog.findFirst({ where: { actorId: desk.id } });
    expect(entry?.action).toBe('media.upload');
    expect(entry?.entityId).toBe(response.body.key);
  });
});
