/**
 * ADR-005 §6: after 5 AVP failures within 10 s, stop calling it for 30 s, then let one
 * probe through. A successful probe closes the circuit; a failed one opens it again.
 */
export interface CircuitBreakerOptions {
  readonly failureThreshold?: number;
  readonly windowMs?: number;
  readonly openMs?: number;
  readonly now?: () => number;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly openMs: number;
  private readonly now: () => number;
  private failures: number[] = [];
  private openedAt: number | null = null;
  private probing = false;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.windowMs = options.windowMs ?? 10_000;
    this.openMs = options.openMs ?? 30_000;
    this.now = options.now ?? Date.now;
  }

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt < this.openMs ? 'open' : 'half-open';
  }

  /** Whether to call AVP now. In half-open, only one caller probes at a time. */
  tryAcquire(): boolean {
    const state = this.state;
    if (state === 'closed') return true;
    if (state === 'open' || this.probing) return false;
    this.probing = true;
    return true;
  }

  success(): void {
    this.failures = [];
    this.openedAt = null;
    this.probing = false;
  }

  failure(): void {
    const now = this.now();
    if (this.probing || this.openedAt !== null) {
      this.openedAt = now;
      this.probing = false;
      return;
    }
    this.failures = [...this.failures.filter((at) => now - at < this.windowMs), now];
    if (this.failures.length >= this.failureThreshold) {
      this.openedAt = now;
      this.failures = [];
    }
  }
}
