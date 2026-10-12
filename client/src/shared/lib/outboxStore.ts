'use client';
import { openDB, type IDBPDatabase } from 'idb';
import { currentVolunteerId, getSessionGeneration } from './session';

// hardcoding-allowed: durable product storage identifier; changing it strands queued captures.
const DB_NAME = 'spoh2027';
export const OUTBOX_STORE = 'outbox';
export type OutboxStatus = 'pending' | 'sending' | 'failed';
export interface OutboxEntry {
  id: string;
  endpoint: string;
  eventId?: string | null;
  method: 'POST';
  body: unknown;
  clientRecordedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: OutboxStatus;
  lastError: string | null;
  ownerId?: string | null;
  claimId?: string;
  claimedAt?: string;
}
export interface OutboxClaim { entry: OutboxEntry; claimId: string; generation: number }
let databasePromise: Promise<IDBPDatabase> | null = null;
/** A bounded lease recovers interrupted sends; server idempotency still owns duplicate prevention. */
const CLAIM_LEASE_MS = 2 * 60 * 1000;

export function outboxDatabase(): Promise<IDBPDatabase> {
  if (!databasePromise) databasePromise = openDB(DB_NAME, 1, {
    upgrade(database) {
      const store = database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
      store.createIndex('status', 'status');
    },
  }).catch((error: unknown) => { databasePromise = null; throw error; });
  return databasePromise;
}

/** Legacy ownerless entries follow the signed-in person, as ADR-007 requires. */
export function belongsToOwner(entry: OutboxEntry, owner = currentVolunteerId()): boolean {
  return entry.ownerId == null || entry.ownerId === owner;
}

export async function storeNewEntry(entry: OutboxEntry): Promise<OutboxEntry> {
  const database = await outboxDatabase();
  const tx = database.transaction(OUTBOX_STORE, 'readwrite');
  const old = await tx.store.get(entry.id) as OutboxEntry | undefined;
  if (old) {
    if (old.endpoint !== entry.endpoint || old.eventId !== entry.eventId || old.ownerId !== entry.ownerId ||
      JSON.stringify(old.body) !== JSON.stringify(entry.body)) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new Error('This capture key already belongs to another intent. Review the capture.');
    }
  } else await tx.store.add(entry);
  await tx.done;
  return old ?? entry;
}

/** Reading status and deleting share the same transaction as claiming a send. */
export async function cancelEntry(id: string): Promise<boolean> {
  const database = await outboxDatabase();
  const tx = database.transaction(OUTBOX_STORE, 'readwrite');
  const entry = await tx.store.get(id) as OutboxEntry | undefined;
  const removable = !!entry && entry.status !== 'sending' && belongsToOwner(entry);
  if (removable) await tx.store.delete(id);
  await tx.done;
  return removable;
}

/** A stale list cannot recreate a cancelled capture or send another tab's live claim. */
export async function claimEntry(id: string): Promise<OutboxClaim | null> {
  const database = await outboxDatabase();
  const generation = getSessionGeneration();
  const tx = database.transaction(OUTBOX_STORE, 'readwrite');
  const entry = await tx.store.get(id) as OutboxEntry | undefined;
  if (!entry || !belongsToOwner(entry) || entry.status === 'failed' || isLiveClaim(entry)) {
    await tx.done;
    return null;
  }
  const claimId = crypto.randomUUID();
  const claimed = { ...entry, status: 'sending' as const, claimId, claimedAt: new Date().toISOString() };
  await tx.store.put(claimed);
  await tx.done;
  return { entry: claimed, claimId, generation };
}

function isLiveClaim(entry: OutboxEntry): boolean {
  if (entry.status !== 'sending') return false;
  const instant = Date.parse(entry.claimedAt ?? entry.lastAttemptAt ?? entry.clientRecordedAt);
  return Number.isFinite(instant) && Date.now() - instant < CLAIM_LEASE_MS;
}

/** Old failures cannot resurrect a successful, cancelled or newly claimed row. */
export async function settleClaim(claim: OutboxClaim, replacement: OutboxEntry | null): Promise<void> {
  const database = await outboxDatabase();
  const tx = database.transaction(OUTBOX_STORE, 'readwrite');
  const current = await tx.store.get(claim.entry.id) as OutboxEntry | undefined;
  if (current?.claimId === claim.claimId) {
    if (replacement) {
      const { claimId: _claimId, claimedAt: _claimedAt, ...rest } = replacement;
      await tx.store.put(rest);
    } else await tx.store.delete(claim.entry.id);
  }
  await tx.done;
}
