import { describe, expect, it } from 'vitest';
import { pageArgs, toPage } from '../../src/platform/db/pagination.js';

/** Keyset pagination (F03-017): one extra row decides whether there is a next page. */

const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `r${i}` }));

describe('pagination', () => {
  it('asks for one row more than the page', () => {
    expect(pageArgs({ limit: 20 })).toEqual({ take: 21 });
    expect(pageArgs({ limit: 20, cursor: 'r9' })).toEqual({
      take: 21,
      cursor: { id: 'r9' },
      skip: 1,
    });
  });

  it.each([
    [3, 5, 3, null],
    [5, 5, 5, null],
    [6, 5, 5, 'r4'],
  ])('%i rows at limit %i → %i rows, next %s', (count, limit, length, next) => {
    const page = toPage(rows(count), limit);
    expect(page.data).toHaveLength(length);
    expect(page.nextCursor).toBe(next);
  });
});
