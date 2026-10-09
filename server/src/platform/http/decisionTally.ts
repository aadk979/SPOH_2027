/**
 * How many questions the enforcement points answered (P11.5), logged every few minutes.
 * Allowed requests are never logged line by line, so without this a quiet log could mean
 * either that nothing was refused or that the policies never ran. The CloudWatch metrics
 * `AuthorizationFailed` and `AuthorizationAllowed` read it (and P11.9's latency metric).
 */
export interface DecisionTally {
  readonly allowed: number;
  readonly denied: number;
  readonly unaskable: number;
  readonly failed: number;
}

type Kind = 'allowed' | 'denied' | 'unaskable' | 'failed';

const EMPTY: DecisionTally = { allowed: 0, denied: 0, unaskable: 0, failed: 0 };

let tally: DecisionTally = EMPTY;
let timer: NodeJS.Timeout | null = null;

export function countOutcome(kind: Kind): void {
  tally = { ...tally, [kind]: tally[kind] + 1 };
}

/** The counts since the last drain, which starts the next period at zero. */
export function drainTally(): DecisionTally {
  const drained = tally;
  tally = EMPTY;
  return drained;
}

/** Log the period's counts, when there were any, every `everyMs`; started once. */
export function startDecisionSummary(log: (tally: DecisionTally) => void, everyMs = 300_000): void {
  if (timer) return;
  timer = setInterval(() => {
    const drained = drainTally();
    if (Object.values(drained).some((count) => count > 0)) log(drained);
  }, everyMs);
  timer.unref();
}
