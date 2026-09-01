'use client';

import { openDB, type IDBPDatabase } from 'idb';
import { api, isRetryable } from './api';

/**
 * The local write buffer (BUILD_PLAN §9.5).
 *
 * This is NOT offline-first architecture. It is ordinary error handling for the
 * ordinary cases: a phone that slept mid-tap, a volunteer who wandered into a
 * stairwell, a dead spot at the back of a lab. Roughly a hundred lines that
 * costs nothing and removes a whole class of "the counter stopped working".
 *
 * The critical property: every entry carries the idempotency key it was created
 * with, and keeps it across every retry. That is what makes retrying safe — the
 * server collapses replays to one row, so a flaky connection can never inflate
 * a count. Without it this buffer would be a duplicate-count machine.
 */

const DB_NAME = 'spoh2027';
const DB_VERSION = 1;
const STORE = 'outbox';

export type OutboxStatus = 'pending' | 'sending' | 'failed';

export interface OutboxEntry {
  /** Equals the idempotencyKey in the body. One key, one row, forever. */
  id: string;
  endpoint: string;
  method: 'POST';
  body: unknown;
  clientRecordedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: OutboxStatus;
  /** Last error message, surfaced on the shift diagnostics panel. */
  lastError: string | null;
}

/** After this many attempts an entry is parked for an IC to salvage by hand. */
export const MAX_ATTEMPTS = 10;

/** Backoff schedule in milliseconds, capped so a long outage still retries. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

/**
 * How long a tap waits before its first send attempt.
 *
 * BUILD_PLAN §9.4 gives the volunteer ten seconds to undo, and says an undo
 * before the request settles cancels it. Sending instantly would make that
 * almost never true — the entry would be in flight before a thumb could reach
 * the undo button, and undo would silently do nothing.
 *
 * It cannot simply be the full ten seconds either: only an IC may void a
 * settled record (§6.3), so an undo that arrives too late has nowhere to go,
 * and the live dashboard must still reflect a capture within five seconds
 * (Phase 3 acceptance). Two seconds covers the mis-tap a volunteer notices
 * immediately while keeping every count well inside that window.
 */
export const SEND_GRACE_MS = 2_000;

/** Thresholds at which the volunteer is told to notify their IC (§9.5). */
export const UNSYNCED_WARNING_COUNT = 20;
export const UNSYNCED_WARNING_AGE_MS = 5 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      const store = database.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('status', 'status');
    },
  });
  return dbPromise;
}

type Listener = (entries: OutboxEntry[]) => void;
const listeners = new Set<Listener>();

async function notify(): Promise<void> {
  const entries = await listEntries();
  for (const listener of listeners) listener(entries);
}

export function subscribeToOutbox(listener: Listener): () => void {
  listeners.add(listener);
  void listEntries().then(listener);
  return () => listeners.delete(listener);
}

export async function listEntries(): Promise<OutboxEntry[]> {
  const database = await db();
  return (await database.getAll(STORE)) as OutboxEntry[];
}

export async function pendingCount(): Promise<number> {
  const entries = await listEntries();
  return entries.filter((entry) => entry.status !== 'failed').length;
}

/**
 * Enqueue a write. Called BEFORE the network attempt, always — the UI updates
 * optimistically off the queue, so a tap that is never sent is still visible
 * rather than silently lost.
 */
export async function enqueue(input: {
  idempotencyKey: string;
  endpoint: string;
  body: unknown;
}): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    id: input.idempotencyKey,
    endpoint: input.endpoint,
    method: 'POST',
    body: input.body,
    clientRecordedAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    status: 'pending',
    lastError: null,
  };

  const database = await db();
  await database.put(STORE, entry);
  await notify();

  // Deliberately not an immediate flush — see SEND_GRACE_MS.
  scheduleFlush(SEND_GRACE_MS);

  return entry;
}

/**
 * Remove an entry that has not been sent yet.
 *
 * This is what "undo" does inside the 10-second window when the request has not
 * settled: cancelling before the send is cleaner than sending and then voiding,
 * because a void leaves a correction in the audit trail for something that
 * never actually happened.
 */
export async function cancel(id: string): Promise<boolean> {
  const database = await db();
  const entry = (await database.get(STORE, id)) as OutboxEntry | undefined;

  if (!entry || entry.status === 'sending') return false;

  await database.delete(STORE, id);
  await notify();
  return true;
}

let flushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export interface FlushOptions {
  /**
   * Send everything now, ignoring the undo grace period and any backoff.
   *
   * This is what the "Try again now" button on the shift screen does: a
   * volunteer who has been told their taps are not landing should not then wait
   * out a thirty-second backoff timer while looking at the screen.
   */
  force?: boolean;
}

/**
 * Drain the queue serially.
 *
 * Serial rather than parallel on purpose: ten concurrent requests from a phone
 * on a congested Wi-Fi cell finish slower than ten sequential ones, and the
 * order of captures within a station is worth preserving for the curve.
 */
export async function flush(options: FlushOptions = {}): Promise<void> {
  if (flushing) return;
  flushing = true;

  try {
    const database = await db();
    const entries = ((await database.getAll(STORE)) as OutboxEntry[])
      .filter((entry) => entry.status !== 'failed')
      .sort((a, b) => a.clientRecordedAt.localeCompare(b.clientRecordedAt));

    for (const entry of entries) {
      const wait = options.force ? 0 : Math.max(backoffRemaining(entry), graceRemaining(entry));
      if (wait > 0) {
        scheduleFlush(wait);
        continue;
      }

      await database.put(STORE, { ...entry, status: 'sending' } satisfies OutboxEntry);

      try {
        await api(entry.endpoint, { method: 'POST', body: entry.body });
        await database.delete(STORE, entry.id);
      } catch (error) {
        const attempts = entry.attempts + 1;
        const message = error instanceof Error ? error.message : 'Unknown error';

        // A 4xx will fail identically forever — retrying it burns battery and
        // hides the real problem. Park it for the diagnostics panel instead.
        const givingUp = !isRetryable(error) || attempts >= MAX_ATTEMPTS;

        await database.put(STORE, {
          ...entry,
          attempts,
          lastAttemptAt: new Date().toISOString(),
          status: givingUp ? 'failed' : 'pending',
          lastError: message,
        } satisfies OutboxEntry);

        if (!givingUp) scheduleFlush(backoffFor(attempts));
      }

      await notify();
    }
  } finally {
    flushing = false;
  }
}

function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? 30_000;
}

/** How long is left of this entry's undo grace period. */
function graceRemaining(entry: OutboxEntry): number {
  if (entry.attempts > 0) return 0;
  const due = new Date(entry.clientRecordedAt).getTime() + SEND_GRACE_MS;
  return Math.max(0, due - Date.now());
}

function backoffRemaining(entry: OutboxEntry): number {
  if (entry.attempts === 0 || !entry.lastAttemptAt) return 0;
  const due = new Date(entry.lastAttemptAt).getTime() + backoffFor(entry.attempts);
  return Math.max(0, due - Date.now());
}

let flushDueAt = Infinity;

/**
 * Schedule a flush, keeping the earliest pending request. A later long backoff
 * must not push out a tap that is due in two seconds.
 */
function scheduleFlush(delayMs: number): void {
  const dueAt = Date.now() + delayMs;
  if (flushTimer && dueAt >= flushDueAt) return;

  if (flushTimer) clearTimeout(flushTimer);
  flushDueAt = dueAt;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushDueAt = Infinity;
    void flush();
  }, delayMs);
}

/**
 * Wire the flush triggers (BUILD_PLAN §9.5): coming back online, the tab
 * becoming visible again after the phone woke, and a slow interval as a
 * backstop for everything neither event catches.
 */
export function startOutboxFlushLoop(): () => void {
  const onOnline = (): void => void flush();
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void flush();
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(() => void flush(), 15_000);

  void flush();

  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(interval);
  };
}

/** Should the volunteer be told to talk to their IC? (§9.5) */
export function needsAttention(entries: OutboxEntry[], now = Date.now()): boolean {
  const unsent = entries.filter((entry) => entry.status !== 'failed');
  if (entries.some((entry) => entry.status === 'failed')) return true;
  if (unsent.length > UNSYNCED_WARNING_COUNT) return true;

  return unsent.some(
    (entry) => now - new Date(entry.clientRecordedAt).getTime() > UNSYNCED_WARNING_AGE_MS,
  );
}

/**
 * Everything an IC needs to salvage the counts by hand, as text they can paste
 * into the fallback sheet. The point of the diagnostics panel is that a failed
 * capture is recoverable, not merely visible.
 */
export function toClipboardText(entries: OutboxEntry[]): string {
  return entries
    .map((entry) =>
      [
        entry.clientRecordedAt,
        entry.endpoint,
        JSON.stringify(entry.body),
        `attempts=${entry.attempts}`,
        entry.lastError ?? '',
      ].join('\t'),
    )
    .join('\n');
}
