import type { Server } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerShutdown } from '../../src/app/shutdown.js';
import { disconnectPrisma } from '../../src/platform/db/client.js';
import { stopCacheBus } from '../../src/platform/events/cacheBus.js';
import { logger } from '../../src/platform/logger/index.js';

vi.mock('../../src/platform/db/client.js', () => ({ disconnectPrisma: vi.fn(async () => {}) }));
vi.mock('../../src/platform/events/cacheBus.js', () => ({ stopCacheBus: vi.fn(async () => {}) }));
vi.mock('../../src/platform/logger/index.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const signals = new Map<string, () => void>();
let close!: () => void;
const jobs = { stop: vi.fn() };
const server = {
  close: vi.fn((callback: () => void) => {
    close = callback;
  }),
} as unknown as Server;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  signals.clear();
  const original = process.on.bind(process);
  vi.spyOn(process, 'on').mockImplementation((event, callback) => {
    if (event === 'SIGTERM' || event === 'SIGINT') {
      signals.set(event, callback);
      return process;
    }
    return original(event, callback);
  });
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('waits for the durable transaction before closing the bus/pool and ignores duplicate signals', async () => {
  let finish!: () => void;
  const drain = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const scheduler = { tick: vi.fn(), stop: vi.fn(() => drain) };
  registerShutdown({ server, jobs, scheduler });
  signals.get('SIGTERM')!();
  signals.get('SIGINT')!();
  close();
  await vi.advanceTimersByTimeAsync(0);
  expect(jobs.stop).toHaveBeenCalledTimes(1);
  expect(scheduler.stop).toHaveBeenCalledTimes(1);
  expect(disconnectPrisma).not.toHaveBeenCalled();
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(stopCacheBus).toHaveBeenCalledTimes(1);
  expect(disconnectPrisma).toHaveBeenCalledTimes(1);
  expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
});

it('logs only a bounded shutdown code if drain fails, then closes the pool', async () => {
  registerShutdown({
    server,
    jobs,
    scheduler: {
      tick: vi.fn(),
      stop: vi.fn(async () => {
        throw new Error('private SQL token');
      }),
    },
  });
  signals.get('SIGTERM')!();
  close();
  await vi.advanceTimersByTimeAsync(0);
  expect(logger.error).toHaveBeenCalledWith(
    { code: 'SCHEDULER_SHUTDOWN_FAILED' },
    'scheduler shutdown failed',
  );
  expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('private SQL token');
  expect(disconnectPrisma).toHaveBeenCalledTimes(1);
  expect(process.exit).toHaveBeenCalledExactlyOnceWith(0);
});

it('retains the ten-second forced-exit limit while a transaction cannot drain', async () => {
  registerShutdown({
    server,
    jobs,
    scheduler: { tick: vi.fn(), stop: vi.fn(() => new Promise<void>(() => {})) },
  });
  signals.get('SIGTERM')!();
  close();
  await vi.advanceTimersByTimeAsync(9_999);
  expect(process.exit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(process.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(disconnectPrisma).not.toHaveBeenCalled();
});
