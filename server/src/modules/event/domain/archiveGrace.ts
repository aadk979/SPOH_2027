/** Captures remain eligible at the exact boundary, so archive must be strictly later. */
export function archiveGraceElapsed(input: {
  closedAt: Date | null;
  now: Date;
  graceHours: number;
}) {
  const elapsed = input.closedAt ? input.now.getTime() - input.closedAt.getTime() : NaN;
  return Number.isFinite(elapsed) && elapsed > input.graceHours * 3600_000;
}
