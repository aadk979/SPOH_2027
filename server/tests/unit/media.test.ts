import { describe, expect, it } from 'vitest';
import { buildKey, isReadableKey } from '../../src/modules/media/domain/mediaKeys.js';

/** Media key rules (P06.8), without S3. */

describe('media keys', () => {
  it('generates a date-partitioned key under the purpose prefix', () => {
    const key = buildKey(
      { purpose: 'lostFound', contentType: 'image/webp' },
      new Date('2027-01-07T03:30:00.000Z'),
      'abc',
    );
    expect(key).toBe('lost-found/2027/01/07/abc.webp');
  });

  it('signs reads only for keys this app could have issued', () => {
    expect(isReadableKey('lost-found/2027/01/07/abc.jpg')).toBe(true);
    expect(isReadableKey('backups/db.dump')).toBe(false);
    expect(isReadableKey('lost-found/../backups/db.dump')).toBe(false);
  });
});
