import type { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Transport = EventEmitter & {
  connect: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};
const fake = vi.hoisted(() => ({
  clients: [] as Transport[],
  connect: vi.fn<() => Promise<void>>(),
  end: vi.fn<() => Promise<void>>(),
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock('pg', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    Client: class extends EventEmitter {
      connect = vi.fn(() => fake.connect());
      query = vi.fn(async () => undefined);
      end = vi.fn(() => fake.end());
      constructor() {
        super();
        fake.clients.push(this);
      }
    },
  };
});
vi.mock('../../src/config/env.js', () => ({ env: { DATABASE_URL: 'unused-unit-transport' } }));
vi.mock('../../src/platform/logger/index.js', () => ({ logger: fake.logger }));

let bus: typeof import('../../src/platform/events/cacheBus.js');
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  fake.clients.length = 0;
  fake.connect.mockReset().mockResolvedValue(undefined);
  fake.end.mockReset().mockResolvedValue(undefined);
  bus = await import('../../src/platform/events/cacheBus.js');
});
afterEach(async () => {
  await bus.stopCacheBus();
  vi.useRealTimers();
});

describe('cache bus transport lifecycle', () => {
  it('opens one listener connection and refreshes subscribers before marking it healthy', async () => {
    const recovered = vi.fn(() => {
      expect(bus.cacheBusStatus()).toBe('degraded');
    });
    bus.onCacheBusRecovered(recovered);
    expect(bus.cacheBusStatus()).toBe('unstarted');
    await bus.startCacheBus();
    await bus.startCacheBus();
    expect(fake.clients).toHaveLength(1);
    expect(fake.clients[0]!.query.mock.calls.map(([query]) => query)).toEqual([
      'LISTEN "settings"',
      'LISTEN "access"',
      'LISTEN "membership"',
      'LISTEN "session"',
      'LISTEN "event.state"',
    ]);
    expect(recovered).toHaveBeenCalledOnce();
    expect(bus.cacheBusStatus()).toBe('connected');
    expect(bus.isCacheBusDegraded()).toBe(false);
    await bus.stopCacheBus();
    await bus.stopCacheBus();
    expect(fake.clients[0]!.end).toHaveBeenCalledOnce();
    expect(bus.cacheBusStatus()).toBe('unstarted');
  });

  it('cancels a pending reconnect when stopped and never opens another connection', async () => {
    await bus.startCacheBus();
    fake.clients[0]!.emit('error', new Error('Connection lost'));
    expect(bus.cacheBusStatus()).toBe('degraded');
    expect(bus.isCacheBusDegraded()).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    await bus.stopCacheBus();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.clients).toHaveLength(1);
    expect(fake.clients[0]!.end).toHaveBeenCalledOnce();
    expect(bus.cacheBusStatus()).toBe('unstarted');
  });

  it('coalesces duplicate disconnect callbacks and refreshes on the single retry', async () => {
    const recovered = vi.fn();
    bus.onCacheBusRecovered(recovered);
    await bus.startCacheBus();
    const lost = fake.clients[0]!.listeners('error')[0]!;
    const ended = fake.clients[0]!.listeners('end')[0]!;
    lost(new Error('Connection lost'));
    ended();
    expect(vi.getTimerCount()).toBe(1);
    expect(fake.logger.warn).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(999);
    expect(fake.clients).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fake.clients).toHaveLength(2);
    expect(recovered).toHaveBeenCalledTimes(2);
    expect(bus.cacheBusStatus()).toBe('connected');
    expect(vi.getTimerCount()).toBe(0);
    await bus.stopCacheBus();
    lost();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps failed connections degraded and caps repeated retry delays at thirty seconds', async () => {
    fake.connect.mockRejectedValue(new Error('Unavailable transport'));
    fake.end.mockRejectedValue(new Error('Already closed'));
    await bus.startCacheBus();
    await bus.startCacheBus();
    expect(fake.clients).toHaveLength(1);
    for (const delay of [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]) {
      const before = fake.clients.length;
      expect(bus.cacheBusStatus()).toBe('degraded');
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fake.clients).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(fake.clients).toHaveLength(before + 1);
    }
    fake.connect.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(bus.cacheBusStatus()).toBe('connected');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes a connection that completes after stop without registering listeners', async () => {
    let finish!: () => void;
    fake.connect.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const starting = bus.startCacheBus();
    expect(bus.isCacheBusDegraded()).toBe(true);
    await bus.stopCacheBus();
    finish();
    await starting;
    expect(fake.clients[0]!.end).toHaveBeenCalledOnce();
    expect(fake.clients[0]!.listenerCount('notification')).toBe(0);
    expect(bus.cacheBusStatus()).toBe('unstarted');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never marks an obsolete connection healthy after stop during subscriber recovery', async () => {
    let finish!: () => void;
    bus.onCacheBusRecovered(() => new Promise<void>((resolve) => (finish = resolve)));
    const starting = bus.startCacheBus();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(bus.cacheBusStatus()).toBe('degraded');
    await bus.stopCacheBus();
    finish();
    await starting;
    expect(bus.cacheBusStatus()).toBe('unstarted');
    expect(fake.clients[0]!.end).toHaveBeenCalledOnce();
  });

  it('isolates malformed notifications and failing subscribers from other listeners', async () => {
    const listener = vi.fn();
    bus.subscribeCacheEvent('settings', () => {
      throw new Error('Subscriber unavailable');
    });
    bus.subscribeCacheEvent('settings', listener);
    await bus.startCacheBus();
    const client = fake.clients[0]!;
    for (const payload of ['null', '[]', '"value"', '42', '{invalid'])
      client.emit('notification', { channel: 'settings', payload });
    client.emit('notification', { channel: 'unknown', payload: '{}' });
    client.emit('notification', { channel: 'access', payload: '{}' });
    expect(listener).not.toHaveBeenCalled();
    client.emit('notification', { channel: 'settings', payload: '{"eventId":"event"}' });
    client.emit('notification', { channel: 'settings' });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(listener.mock.calls).toEqual([[{ eventId: 'event' }], [{}]]);
    expect(fake.logger.warn).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(fake.logger.error).toHaveBeenCalledTimes(2));
    expect(bus.cacheBusStatus()).toBe('connected');
    expect(vi.getTimerCount()).toBe(0);
  });
});
