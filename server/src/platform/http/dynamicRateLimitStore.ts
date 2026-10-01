import type { Store, ClientRateLimitInfo } from 'express-rate-limit';

interface Counter {
  totalHits: number;
  resetTime: Date;
}

/** In-process store for P10.4. P15.2 replaces this boundary with Postgres. */
export class DynamicRateLimitStore implements Store {
  readonly localKeys = true;
  private readonly counters = new Map<string, Counter>();
  private increments = 0;

  private active(key: string): Counter | undefined {
    const counter = this.counters.get(key);
    if (counter && counter.resetTime.getTime() > Date.now()) return counter;
    if (counter) this.counters.delete(key);
    return undefined;
  }

  private prune(): void {
    for (const key of this.counters.keys()) this.active(key);
  }

  increment(key: string): ClientRateLimitInfo {
    if (++this.increments % 1_024 === 0) this.prune();
    const existing = this.active(key);
    if (existing) {
      existing.totalHits += 1;
      return { ...existing };
    }
    const separator = key.indexOf('|');
    const windowSeconds = Number(key.slice(2, separator));
    if (
      separator < 0 ||
      !Number.isInteger(windowSeconds) ||
      windowSeconds < 10 ||
      windowSeconds > 600
    ) {
      throw new Error('Invalid internal rate limit window');
    }
    const counter = { totalHits: 1, resetTime: new Date(Date.now() + windowSeconds * 1_000) };
    this.counters.set(key, counter);
    return { ...counter };
  }

  decrement(key: string): void {
    const counter = this.active(key);
    if (counter) counter.totalHits = Math.max(0, counter.totalHits - 1);
  }

  get(key: string): ClientRateLimitInfo | undefined {
    const counter = this.active(key);
    return counter ? { ...counter } : undefined;
  }

  resetKey(key: string): void {
    this.counters.delete(key);
  }

  /** Compatibility for tests and callers that name a subject without a scope. */
  resetSubject(subject: string): void {
    for (const key of this.counters.keys()) {
      if (key.endsWith(`|${subject}`)) this.counters.delete(key);
    }
  }

  resetAll(): void {
    this.counters.clear();
  }
}
