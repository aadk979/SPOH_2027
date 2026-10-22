type Posting = { id: string; shift: { startsAt: Date; endsAt: Date } };

/** Prefer the scheduled posting; rehearsal may still use another permitted posting. */
export function currentAssignment<T extends Posting>(
  assignments: T[],
  permitted: ReadonlySet<string>,
  now: Date,
): T | null {
  const available = assignments.filter((assignment) => permitted.has(assignment.id));
  return (
    available.find(({ shift }) => shift.startsAt <= now && shift.endsAt > now) ??
    available[0] ??
    null
  );
}
