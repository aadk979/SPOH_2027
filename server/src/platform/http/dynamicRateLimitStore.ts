import type { Store, ClientRateLimitInfo } from 'express-rate-limit';
import { prisma, type PrismaTransactionClient } from '../db/client.js';
import { ServiceUnavailableError } from '../errors/index.js';
import { systemClock, type Clock } from '../time/index.js';
import { incrementCounter, readCounter, refundCounter, resetCounter,
  resetCounterNamespace, resetCounterSubject, type CounterCharge, type QuotaNamespace } from './quotaCounterRepo.js';
import { counterNumber, parseQuotaKey, quotaDigest } from './quotaKeys.js';
import { captureQuotaCharge, refundCapturedQuota } from './quotaRequestCharge.js';

/** All app instances share SQL admission; storage failure never admits a request. */
export class DynamicRateLimitStore implements Store {
  readonly localKeys = false;
  private readonly db: PrismaTransactionClient;
  private readonly clock: Clock;
  constructor(readonly namespace: QuotaNamespace, input: { db?: PrismaTransactionClient; clock?: Clock } = {}) {
    this.db = input.db ?? prisma;
    this.clock = input.clock ?? systemClock;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    try {
      const increment = await incrementCounter(this.db, parseQuotaKey(key, this.namespace), this.clock.now());
      captureQuotaCharge(key, increment.charge);
      return { totalHits: counterNumber(increment.totalHits), resetTime: increment.charge.resetTime };
    } catch (error) { throw new ServiceUnavailableError('Request quota temporarily unavailable', error); }
  }

  async refund(charge: CounterCharge): Promise<boolean> {
    if (charge.namespace !== this.namespace) throw new Error('Quota refund namespace mismatch');
    return refundCounter(this.db, charge, this.clock.now());
  }
  async decrement(key: string): Promise<void> {
    await refundCapturedQuota(key, (charge) => this.refund(charge));
  }
  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const counter = await readCounter(this.db, parseQuotaKey(key, this.namespace), this.clock.now());
    return counter ? { totalHits: counterNumber(counter.totalHits), resetTime: counter.charge.resetTime } : undefined;
  }
  async resetKey(key: string): Promise<void> {
    await resetCounter(this.db, parseQuotaKey(key, this.namespace));
  }
  /** Compatibility for explicit test/operational subject resets across organisation windows. */
  async resetSubject(subject: string): Promise<void> {
    await resetCounterSubject(this.db, { namespace: this.namespace, subjectDigest: quotaDigest(subject) });
  }
  async resetAll(): Promise<void> { await resetCounterNamespace(this.db, this.namespace); }
}
