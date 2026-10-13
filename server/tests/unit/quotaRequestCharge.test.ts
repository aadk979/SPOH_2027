import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { captureQuotaCharge, settleQuotaRefunds, withSuccessfulQuotaRefund } from '../../src/platform/http/quotaRequestCharge.js';
import type { CounterCharge } from '../../src/platform/http/quotaCounterRepo.js';
import { counterNumber, parseQuotaKey, quotaKey } from '../../src/platform/http/quotaKeys.js';

const response = (statusCode: number) => Object.assign(new EventEmitter(), { statusCode }) as unknown as Response;
const charge = (generation: string): CounterCharge => ({ namespace: 'http.sign-in-failure',
  scopeDigest: 'a'.repeat(64), subjectDigest: 'b'.repeat(64), generation, resetTime: new Date(1000) });

describe('response quota charge ownership', () => {
  it('refunds the originating charge when another request context emits finish, once only', async () => {
    const first = response(201);
    const second = response(201);
    const refund = vi.fn().mockResolvedValue(true);
    withSuccessfulQuotaRefund({ key: 'first', res: first, refund }, () => captureQuotaCharge('first', charge('first-generation')));
    withSuccessfulQuotaRefund({ key: 'second', res: second, refund }, () => {
      captureQuotaCharge('second', charge('second-generation'));
      first.emit('finish');
      first.emit('finish');
    });
    await settleQuotaRefunds();
    expect(refund).toHaveBeenCalledExactlyOnceWith(charge('first-generation'));
    second.emit('finish');
    await settleQuotaRefunds();
    expect(refund.mock.calls.map(([value]) => value.generation)).toEqual(['first-generation', 'second-generation']);
  });

  it.each([400, 404, 429, 503])('retains an unsuccessful %i charge', async (status) => {
    const res = response(status);
    const refund = vi.fn();
    withSuccessfulQuotaRefund({ key: 'failure', res, refund }, () => captureQuotaCharge('failure', charge('failure')));
    res.emit('finish');
    await settleQuotaRefunds();
    expect(refund).not.toHaveBeenCalled();
  });

  it('settles a rejected refund conservatively and never repeats its external attempt', async () => {
    const res = response(200);
    const refund = vi.fn().mockRejectedValue(new Error('database unavailable'));
    withSuccessfulQuotaRefund({ key: 'outage', res, refund }, () => captureQuotaCharge('outage', charge('outage')));
    res.emit('finish');
    res.emit('finish');
    await expect(settleQuotaRefunds()).resolves.toBeUndefined();
    expect(refund).toHaveBeenCalledOnce();
  });

  it('retains a charge when a response closes without successful finish', async () => {
    const res = response(200);
    const refund = vi.fn();
    withSuccessfulQuotaRefund({ key: 'closed', res, refund }, () => captureQuotaCharge('closed', charge('closed')));
    res.emit('close');
    await settleQuotaRefunds();
    expect(refund).not.toHaveBeenCalled();
  });

  it('does not refund a success for which admission never installed a charge', async () => {
    const res = response(200);
    const refund = vi.fn();
    withSuccessfulQuotaRefund({ key: 'unadmitted', res, refund }, () => undefined);
    res.emit('finish');
    await settleQuotaRefunds();
    expect(refund).not.toHaveBeenCalled();
  });
});

describe('opaque quota keys', () => {
  it('separates organisation/window/tier without exposing provider subjects or addresses', () => {
    const key = quotaKey({ namespace: 'http.default', scope: ['org-a', 60], subject: 'sub:private-subject', windowSeconds: 60 });
    expect(key).not.toContain('private-subject');
    const parsed = parseQuotaKey(key, 'http.default');
    expect(parsed.scopeDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.subjectDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(() => parseQuotaKey(key, 'http.capture')).toThrow('Invalid internal');
    expect(() => parseQuotaKey('["http.default","bad","bad",6000]', 'http.default')).toThrow();
    expect(counterNumber(9_223_372_036_854_775_807n)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
