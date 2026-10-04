import { expect, it } from 'vitest';
import { MediaUrlQuery } from './index.js';

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
