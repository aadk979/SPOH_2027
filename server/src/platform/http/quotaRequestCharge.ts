import { AsyncLocalStorage } from 'node:async_hooks';
import type { Response } from 'express';
import { logger } from '../logger/index.js';
import type { CounterCharge } from './quotaCounterRepo.js';

interface ChargeContext {
  readonly key: string;
  charge?: Readonly<CounterCharge>;
  refunded: boolean;
}
const charges = new AsyncLocalStorage<ChargeContext>();
const PENDING = Symbol.for('@spoh/server/quotaRefunds.pending');
const pending = ((globalThis as Record<symbol, unknown>)[PENDING] ??= new Set<Promise<void>>()) as Set<Promise<void>>;

export function captureQuotaCharge(key: string, charge: CounterCharge): void {
  const context = charges.getStore();
  if (!context) return;
  if (context.key !== key || context.charge) throw new Error('Quota charge context mismatch');
  context.charge = Object.freeze({ ...charge });
}

function refundOnce(context: ChargeContext, refund: (charge: CounterCharge) => Promise<unknown>) {
  if (context.refunded || !context.charge) return;
  context.refunded = true;
  const charge = context.charge;
  const work = Promise.resolve().then(() => refund(charge)).then(() => undefined)
    .catch(() => logger.error({ namespace: charge.namespace }, 'quota refund failed; charge retained'))
    .finally(() => pending.delete(work));
  pending.add(work);
}

/** Bind at registration, not at the EventEmitter's eventual finish invocation. */
export function withSuccessfulQuotaRefund<T>(input: {
  key: string; res: Response; refund: (charge: CounterCharge) => Promise<unknown>;
}, operation: () => T): T {
  return charges.run({ key: input.key, refunded: false }, () => {
    const context = charges.getStore()!;
    input.res.once('finish', AsyncLocalStorage.bind(() => {
      if (input.res.statusCode < 400) refundOnce(context, input.refund);
    }));
    return operation();
  });
}

/** Store compatibility is fenced by the originating request, never a latest-key lookup. */
export async function refundCapturedQuota(key: string, refund: (charge: CounterCharge) => Promise<unknown>) {
  const context = charges.getStore();
  if (!context || context.key !== key) throw new Error('Quota refund requires its request charge');
  refundOnce(context, refund);
  await settleQuotaRefunds();
}

export async function settleQuotaRefunds(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
