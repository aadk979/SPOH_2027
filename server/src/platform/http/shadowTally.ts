/**
 * How many questions the shadow enforcement points answered (P11.5), logged every few
 * minutes. Agreement is never logged line by line, so without this a quiet log could mean
 * either that the policies agree or that they never ran; P11.9's metric reads it too.
 */
export interface ShadowTally {
  readonly allowed: number;
  readonly denied: number;
  readonly unaskable: number;
  readonly failed: number;
  readonly findings: number;
}

type Kind = 'allowed' | 'denied' | 'unaskable' | 'failed';

const EMPTY: ShadowTally = { allowed: 0, denied: 0, unaskable: 0, failed: 0, findings: 0 };

let tally: ShadowTally = EMPTY;
let timer: NodeJS.Timeout | null = null;

export function countOutcome(kind: Kind): void {
  tally = { ...tally, [kind]: tally[kind] + 1 };
}

export function countFinding(): void {
  tally = { ...tally, findings: tally.findings + 1 };
}

/** The counts since the last drain, which starts the next period at zero. */
export function drainTally(): ShadowTally {
  const drained = tally;
  tally = EMPTY;
  return drained;
}

/** Log the period's counts, when there were any, every `everyMs`; started once. */
export function startShadowSummary(log: (tally: ShadowTally) => void, everyMs = 300_000): void {
  if (timer) return;
  timer = setInterval(() => {
    const drained = drainTally();
    if (Object.values(drained).some((count) => count > 0)) log(drained);
  }, everyMs);
  timer.unref();
}
