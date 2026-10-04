import { expect, it } from 'vitest';
import { mediaObjectOrigin } from '../../src/platform/aws/mediaOrigin.js';

it.each(['ap-southeast-1', 'us-east-1'])(
  'derives the exact %s regional bucket origin',
  (region) => {
    expect(mediaObjectOrigin({ bucket: 'spoh-synthetic-media', region })).toBe(
      `https://spoh-synthetic-media.s3.${region}.amazonaws.com`,
    );
  },
);
it('adds no object destination when media is disabled', () => {
  expect(mediaObjectOrigin({ region: 'ap-southeast-1' })).toBeNull();
  expect(mediaObjectOrigin({ bucket: '', region: 'ap-southeast-1' })).toBeNull();
});
it.each([
  '*',
  'https://bucket.test',
  'bucket; script-src *',
  'bucket/path',
  'bucket.test',
  'BUCKET',
  'bucket name',
  'a',
  'a'.repeat(64),
  '-bucket',
  'bucket-',
  '127.0.0.1',
])('refuses an unsafe or unsupported media bucket: %s', (bucket) => {
  expect(() => mediaObjectOrigin({ bucket, region: 'ap-southeast-1' })).toThrow();
});
it.each(['*', 'ap-southeast-1; script-src *', 'https://region.test', 'cn-north-1', ''])(
  'refuses an unsafe or unsupported region: %s',
  (region) => {
    expect(() => mediaObjectOrigin({ bucket: 'spoh-synthetic-media', region })).toThrow();
  },
);
