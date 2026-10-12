export function afterTime(anchor: { id: string; at: Date } | null, column: string) {
  return anchor ? { OR: [{ [column]: { lt: anchor.at } },
    { [column]: anchor.at, id: { lt: anchor.id } }] } : {};
}
export function boundedPage<T extends { id: string }>(rows: T[], limit: number) {
  return { rows: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
