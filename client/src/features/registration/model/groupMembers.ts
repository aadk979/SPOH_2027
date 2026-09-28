import type { VisitorCategory } from '@spoh/shared';
export type GroupCounts = Partial<Record<VisitorCategory, number>>;
export function groupTotal(counts: GroupCounts): number {
  return Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0);
}
export function adjustGroup(
  counts: GroupCounts,
  category: VisitorCategory,
  delta: number,
): GroupCounts {
  const next = Math.max(0, (counts[category] ?? 0) + delta);
  const updated = { ...counts, [category]: next };
  if (next === 0) delete updated[category];
  return updated;
}
export function groupMembers(counts: GroupCounts) {
  return Object.entries(counts)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([category, count]) => ({
      category: category as VisitorCategory,
      count: count as number,
    }));
}
