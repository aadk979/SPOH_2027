import { Client, type Notification } from 'pg';
import { env } from '../../config/env.js';
import type { PrismaTransactionClient } from '../db/client.js';
import { logger } from '../logger/index.js';

export type CacheChannel = 'settings' | 'access' | 'membership' | 'session' | 'event.state';
type Listener = (payload: Record<string, unknown>) => void | Promise<void>;
const CHANNELS: readonly CacheChannel[] = [
  'settings',
  'access',
  'membership',
  'session',
  'event.state',
];
const listeners = new Map<CacheChannel, Set<Listener>>();
const recovered = new Set<() => void | Promise<void>>();

let connection: Client | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let state: 'unstarted' | 'connecting' | 'connected' | 'degraded' = 'unstarted';
let stopped = false;
let attempt = 0;

function dispatch(listener: Listener, payload: Record<string, unknown>): void {
  void Promise.resolve()
    .then(() => listener(payload))
    .catch((error: unknown) => {
      logger.error({ err: error }, 'cache bus subscriber failed');
    });
}

function onNotification(notification: Notification): void {
  const channel = notification.channel as CacheChannel;
  if (!CHANNELS.includes(channel)) return;
  try {
    const payload: unknown = JSON.parse(notification.payload ?? '{}');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    for (const listener of listeners.get(channel) ?? []) {
      dispatch(listener, payload as Record<string, unknown>);
    }
  } catch (error) {
    logger.warn({ err: error, channel }, 'invalid cache bus notification');
  }
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
  reconnectTimer.unref();
}

function disconnected(error?: unknown): void {
  if (stopped || state === 'degraded') return;
  state = 'degraded';
  logger.warn({ err: error }, 'cache bus disconnected; bypassing identity caches');
  const old = connection;
  connection = null;
  old?.removeAllListeners();
  void old?.end().catch(() => undefined);
  scheduleReconnect();
}

async function connect(): Promise<void> {
  if (stopped) return;
  state = 'connecting';
  const candidate = new Client({
    connectionString: env.DATABASE_URL,
    options: '-c TimeZone=UTC',
    // hardcoding-allowed: stable process identifier for diagnosing listener connections.
    application_name: 'spoh-cache-bus',
  });
  try {
    await candidate.connect();
    for (const channel of CHANNELS) await candidate.query(`LISTEN "${channel}"`);
    if (stopped) {
      await candidate.end();
      return;
    }
    connection = candidate;
    candidate.on('notification', onNotification);
    candidate.on('error', disconnected);
    candidate.on('end', () => disconnected());
    // Keep security caches in bypass mode until every subscriber has refreshed.
    for (const listener of recovered) await listener();
    if (stopped || connection !== candidate) return;
    state = 'connected';
    attempt = 0;
  } catch (error) {
    candidate.removeAllListeners();
    await candidate.end().catch(() => undefined);
    state = 'degraded';
    logger.warn({ err: error }, 'cache bus connection failed');
    scheduleReconnect();
  }
}

/** One dedicated Postgres connection per process, outside the Prisma pool. */
export async function startCacheBus(): Promise<void> {
  if (state !== 'unstarted') return;
  stopped = false;
  await connect();
}

export async function stopCacheBus(): Promise<void> {
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const old = connection;
  connection = null;
  state = 'unstarted';
  old?.removeAllListeners();
  await old?.end().catch(() => undefined);
}

export function cacheBusStatus(): 'unstarted' | 'connected' | 'degraded' {
  return state === 'connecting' ? 'degraded' : state;
}

export function isCacheBusDegraded(): boolean {
  return state === 'connecting' || state === 'degraded';
}

export function subscribeCacheEvent(channel: CacheChannel, listener: Listener): void {
  const subscribers = listeners.get(channel) ?? new Set<Listener>();
  subscribers.add(listener);
  listeners.set(channel, subscribers);
}

export function onCacheBusRecovered(listener: () => void | Promise<void>): void {
  recovered.add(listener);
}

/** Postgres delivers this only after the caller's transaction commits. */
export async function publishCacheEvent(
  tx: PrismaTransactionClient,
  channel: CacheChannel,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_notify(${channel}, ${JSON.stringify(payload)})`;
}
