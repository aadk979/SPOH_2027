'use client';
import { ConfirmOutboxSalvageResponse, type ConfirmOutboxSalvageRequest } from '@spoh/shared';
import { eventApiPath } from './eventApi';
import { currentVolunteerId, getSessionGeneration } from './session';
import { belongsToOwner, OUTBOX_STORE, outboxDatabase, type OutboxEntry } from './outboxStore';

export type CaptureKind = ConfirmOutboxSalvageRequest['entries'][number]['captureKind'];
const CAPTURE_PATHS: Readonly<Record<string, CaptureKind>> = {
  '/registrations': 'registration', '/footfall/ticks': 'footfall',
  '/gifts/redemptions': 'redemption', '/incidents': 'incident',
};

export function salvageCaptureKind(entry: OutboxEntry): CaptureKind | null {
  if (!entry.eventId) return null;
  const prefix = eventApiPath(entry.eventId, '');
  if (!entry.endpoint.startsWith(prefix)) return null;
  const path = entry.endpoint.slice(prefix.length);
  if (/^\/cards\/[^/]+\/stamps$/.test(path)) return 'stamp';
  return CAPTURE_PATHS[path] ?? null;
}

interface SalvageSelection { eventId: string; personId: string; selectedIds: string[]; generation: number }
function sameKeys(selected: string[], confirmed: string[]): boolean {
  const wanted = new Set(selected);
  return wanted.size === selected.length && wanted.size === confirmed.length &&
    new Set(confirmed).size === confirmed.length && confirmed.every((key) => wanted.has(key));
}
function currentOwner(selection: SalvageSelection): boolean {
  return currentVolunteerId() === selection.personId && getSessionGeneration() === selection.generation;
}
function proofMatches(selection: SalvageSelection, proof: ConfirmOutboxSalvageResponse): boolean {
  return proof.eventId === selection.eventId && proof.personId === selection.personId &&
    sameKeys(selection.selectedIds, proof.confirmedKeys) && currentOwner(selection);
}
function parkedSelection(row: OutboxEntry, selection: SalvageSelection): boolean {
  return row.status === 'failed' && row.eventId === selection.eventId && belongsToOwner(row, selection.personId);
}

/** The audited server proof precedes an atomic, selected-only deletion of parked local rows. */
export async function clearConfirmedFailed(selection: SalvageSelection, value: unknown): Promise<number> {
  const proof = ConfirmOutboxSalvageResponse.parse(value);
  if (!proofMatches(selection, proof))
    throw new Error('Recovery confirmation does not match this selection and session. Keep the captures.');
  const database = await outboxDatabase();
  const tx = database.transaction(OUTBOX_STORE, 'readwrite');
  let cleared = 0;
  try {
    for (const id of selection.selectedIds) {
      const row = await tx.store.get(id) as OutboxEntry | undefined;
      if (!currentOwner(selection)) throw new Error('Your session changed. Keep the captures.');
      if (!row) continue;
      if (!parkedSelection(row, selection))
        throw new Error('A selected capture changed. Keep the captures and review the selection.');
      await tx.store.delete(id);
      cleared += 1;
    }
    if (!currentOwner(selection)) throw new Error('Your session changed. Keep the captures.');
    await tx.done;
  } catch (error) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw error;
  }
  return cleared;
}
