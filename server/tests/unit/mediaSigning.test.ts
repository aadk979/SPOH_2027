import { expect, it, vi } from 'vitest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { presignRead } from '../../src/modules/media/application/s3.js';

vi.mock('../../src/config/env.js', () => ({
  env: { S3_MEDIA_BUCKET: 'spoh-synthetic-media', AWS_REGION: 'ap-southeast-1' },
  isTest: true,
  isProduction: false,
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(() => Promise.resolve('https://synthetic.test/read')),
}));
it('signs private image reads with no-store as an authenticated S3 response override', async () => {
  await presignRead('lost-found/synthetic.png', 300);
  const command = vi.mocked(getSignedUrl).mock.calls[0]![1];
  expect(command).toBeInstanceOf(GetObjectCommand);
  expect((command as GetObjectCommand).input).toEqual({
    Bucket: 'spoh-synthetic-media',
    Key: 'lost-found/synthetic.png',
    ResponseCacheControl: 'no-store',
  });
});
