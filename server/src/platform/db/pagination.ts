/**
 * Keyset pagination, the one way (engineering-standards §11, F03-017).
 *
 * A page asks for one row more than it returns: the extra row is the only
 * honest answer to "is there another page", so the last page says
 * `nextCursor: null` instead of sending the client for an empty one. Every
 * list orders by its sort key and then by `id`, so rows that tie on the sort
 * key keep one order and none is skipped or repeated across pages.
 */

export interface PageRequest {
  limit: number;
  cursor?: string | undefined;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** The Prisma `take`/`cursor`/`skip` for one page. Pair it with an `id` tiebreak in `orderBy`. */
export function pageArgs(page: PageRequest) {
  return {
    take: page.limit + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  };
}

/** Cut the extra row off and turn it into the next cursor. */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const data = rows.slice(0, limit);
  return { data, nextCursor: rows.length > limit ? (data.at(-1)?.id ?? null) : null };
}
