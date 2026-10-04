import { expect, it } from 'vitest';
import { CreateUploadRequest, MediaUrlQuery } from './index.js';

it('keeps media reads an opaque key query without client-selected authority', () => {
  const query = { key: 'lost-found/2027/01/07/synthetic-photo.jpg' };
  expect(MediaUrlQuery.parse(query)).toEqual(query);
  for (const patch of [
    { eventId: 'foreign' },
    { actorId: 'private-person' },
    { scope: 'platform' },
  ])
    expect(MediaUrlQuery.safeParse({ ...query, ...patch }).success).toBe(false);
});
it('rejects missing, empty, unbounded and non-scalar media keys', () => {
  for (const query of [{}, { key: '' }, { key: 'x'.repeat(201) }, { key: ['a', 'b'] }])
    expect(MediaUrlQuery.safeParse(query).success).toBe(false);
});

const intent = {
  idempotencyKey: '00000000-0000-4000-8000-000000000000',
  purpose: 'lostFound',
  contentType: 'image/png',
  contentLength: 1000,
};
it('requires a UUID for each bounded photo intent', () => {
  expect(CreateUploadRequest.parse(intent)).toEqual(intent);
  for (const idempotencyKey of [undefined, '', 'arbitrary', ['a'], 42])
    expect(CreateUploadRequest.safeParse({ ...intent, idempotencyKey }).success).toBe(false);
});
it('rejects client-selected upload authority, keys and credentials', () => {
  for (const patch of [
    { eventId: 'foreign' },
    { actorId: 'other' },
    { key: 'lost-found/other.jpg' },
    { url: 'https://bucket.test' },
    { fields: { policy: 'secret' } },
  ])
    expect(CreateUploadRequest.safeParse({ ...intent, ...patch }).success).toBe(false);
});
