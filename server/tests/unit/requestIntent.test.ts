import { describe, expect, it } from 'vitest';
import { requestIntentHash } from '../../src/platform/http/requestIntent.js';

const intent = (body: unknown, query: Record<string, string | string[]> = {}) =>
  requestIntentHash({ method: 'POST', originalUrl: '/same/target', body, query });

describe('retry request intent', () => {
  it('canonicalises object keys recursively while preserving exact supplied values', () => {
    expect(intent({ b: { d: 1, c: 2 }, a: false }, { z: '1', a: '2' }))
      .toBe(intent({ a: false, b: { c: 2, d: 1 } }, { a: '2', z: '1' }));
    expect(intent({ value: null })).not.toBe(intent({}));
    expect(intent({ value: '1' })).not.toBe(intent({ value: 1 }));
  });
  it('preserves array order, null entries, method and the exact target path', () => {
    expect(intent({ rows: [1, null, 2] })).not.toBe(intent({ rows: [2, null, 1] }));
    const source = { method: 'POST', originalUrl: '/same/target?x=1', body: {}, query: { x: '1' } };
    expect(requestIntentHash(source)).not.toBe(requestIntentHash({ ...source, method: 'DELETE' }));
    expect(requestIntentHash(source)).not.toBe(requestIntentHash({ ...source, originalUrl: '/other/target?x=1' }));
    expect(requestIntentHash(source)).toBe(requestIntentHash({ ...source, originalUrl: '/same/target?ignored-transport-order' }));
  });
  it('retains only a SHA256 digest of sensitive body and query inputs', () => {
    const hash = intent({ email: 'private-sentinel@example.test' }, { token: 'query-sentinel' });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toMatch(/private|sentinel|token/);
  });
  it('canonicalises only the reviewed resolved-event alias, retaining exact scope and target identity', () => {
    const request = { method: 'POST', originalUrl: '/api/v1/registrations', query: {}, body: { idempotencyKey: 'key' },
      requestedEvent: { eventId: 'event-one', fromPath: false } };
    const explicit = { ...request, originalUrl: '/api/v1/events/event-one/registrations',
      requestedEvent: { eventId: 'event-one', fromPath: true } };
    expect(requestIntentHash(request)).toBe(requestIntentHash(explicit));
    expect(requestIntentHash(request)).not.toBe(requestIntentHash({ ...explicit,
      originalUrl: '/api/v1/events/event-two/registrations', requestedEvent: { eventId: 'event-two', fromPath: true } }));
    expect(requestIntentHash(request)).not.toBe(requestIntentHash({ ...request, requestedEvent: undefined }));
  });
});
