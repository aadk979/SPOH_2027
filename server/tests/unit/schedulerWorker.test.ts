import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ClaimedAction } from '../../src/platform/scheduler/claimRepo.js';
import { startWorkerLoop } from '../../src/platform/scheduler/workerLoop.js';

const action = (id: string) => ({ id }) as ClaimedAction;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it('polls immediately and every five seconds, coalescing overlapping manual and timed ticks', async () => {
  const hold = deferred();
  const claim = vi.fn(async () => {
    await hold.promise;
    return [action('one')];
  });
  const execute = vi.fn(async () => {});
  const recordMetrics = vi.fn(async () => {});
  const worker = startWorkerLoop({ claim, execute, recordMetrics, pollFailed: vi.fn() });
  const first = worker.tick();
  expect(worker.tick()).toBe(first);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(claim).toHaveBeenCalledTimes(1);
  hold.resolve();
  await first;
  expect(execute).toHaveBeenCalledTimes(1);
  expect(recordMetrics).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(claim).toHaveBeenCalledTimes(2);
  await worker.stop();
  await vi.advanceTimersByTimeAsync(30_000);
  await worker.tick();
  expect(claim).toHaveBeenCalledTimes(2);
});

it('executes a batch serially and stop drains the current action while leaving the remaining leases recoverable', async () => {
  const hold = deferred();
  const execute = vi.fn(async () => {
    await hold.promise;
  });
  const metrics = vi.fn(async () => {});
  const worker = startWorkerLoop({
    claim: async () => [action('one'), action('two')],
    execute,
    recordMetrics: metrics,
    pollFailed: vi.fn(),
  });
  const tick = worker.tick();
  await vi.advanceTimersByTimeAsync(0);
  expect(execute).toHaveBeenCalledTimes(1);
  let drained = false;
  const stopping = worker.stop().then(() => {
    drained = true;
  });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(drained).toBe(false);
  hold.resolve();
  await stopping;
  await tick;
  expect(execute).toHaveBeenCalledTimes(1);
  expect(metrics).not.toHaveBeenCalled();
});

it('continues polling after a failed claim and does not forward the raw error to the log port', async () => {
  const claim = vi.fn().mockRejectedValueOnce(new Error('private SQL token')).mockResolvedValue([]);
  const pollFailed = vi.fn();
  const worker = startWorkerLoop({
    claim,
    execute: vi.fn(),
    recordMetrics: async () => {},
    pollFailed,
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(pollFailed).toHaveBeenCalledExactlyOnceWith();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(claim).toHaveBeenCalledTimes(2);
  await worker.stop();
});

it('propagates manual tick and shutdown failure without consuming the remainder of a broken batch', async () => {
  const hold = deferred();
  const execute = vi.fn(async () => {
    await hold.promise;
    throw new Error('database unavailable');
  });
  const worker = startWorkerLoop({
    claim: async () => [action('one'), action('two')],
    execute,
    recordMetrics: vi.fn(),
    pollFailed: vi.fn(),
  });
  const tick = worker.tick();
  await vi.advanceTimersByTimeAsync(0);
  const stopping = worker.stop();
  const outcomes = Promise.allSettled([tick, stopping]);
  hold.resolve();
  const results = await outcomes;
  expect(results.every((result) => result.status === 'rejected')).toBe(true);
  expect(execute).toHaveBeenCalledTimes(1);
});
