/**
 * How AVP answered (P11.9), logged every few minutes as `avp summary`: calls, failures by kind,
 * and latency. The CloudWatch metrics `AvpFailed`, `AvpThrottled` and `AvpLatencyP95` read it;
 * a log line per call would cost more than the calls.
 */
export interface AvpTally {
  readonly calls: number;
  /** Attempts that ended in a server fault, a timeout or a network error. */
  readonly failed: number;
  readonly throttled: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

export type AvpOutcome = 'ok' | 'failed' | 'throttled';

let durations: number[] = [];
let failed = 0;
let throttled = 0;
let timer: NodeJS.Timeout | null = null;

export function recordAvpAttempt(outcome: AvpOutcome, ms: number): void {
  durations.push(ms);
  if (outcome === 'failed') failed += 1;
  if (outcome === 'throttled') throttled += 1;
}

/** The period's figures, which starts the next period at zero. */
export function drainAvpTally(): AvpTally {
  const sorted = [...durations].sort((a, b) => a - b);
  const p95 = sorted.length === 0 ? 0 : (sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0);
  const drained = {
    calls: sorted.length,
    failed,
    throttled,
    p95Ms: Math.round(p95),
    maxMs: Math.round(sorted.at(-1) ?? 0),
  };
  durations = [];
  failed = 0;
  throttled = 0;
  return drained;
}

/** Log the period's figures, when there were calls, every `everyMs`; started once. */
export function startAvpSummary(log: (tally: AvpTally) => void, everyMs = 300_000): void {
  if (timer) return;
  timer = setInterval(() => {
    const drained = drainAvpTally();
    if (drained.calls > 0) log(drained);
  }, everyMs);
  timer.unref();
}
