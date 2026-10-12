import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancel, enqueue, flush, listEntries, upgradeLegacyEntries } from '@/shared/lib/outbox';
import { claimEntry, OUTBOX_STORE, outboxDatabase, settleClaim, type OutboxEntry } from '@/shared/lib/outboxStore';
import { clearConfirmedFailed, salvageCaptureKind } from '@/shared/lib/outboxSalvage';
import { clearSession, getSessionGeneration, setSession } from '@/shared/lib/session';
import { api } from '@/shared/lib/api';

vi.mock('@/shared/lib/api', async (original) => ({ ...(await original<typeof import('@/shared/lib/api')>()), api: vi.fn() }));
const keyA = '11111111-1111-4111-8111-111111111111';
const keyB = '22222222-2222-4222-8222-222222222222';
const owner = (id = 'owner-a') => setSession({ accessToken: 'synthetic', volunteerId: id, displayName: 'Owner', role: 'VOLUNTEER', expiresAt: Date.now() + 60_000, refreshAvailable: false });
const selection = (selectedIds = [keyA]) => ({ eventId: 'event-a', personId: 'owner-a', selectedIds, generation: getSessionGeneration() });
const proof = (confirmedKeys = [keyA]) => ({ eventId: 'event-a', personId: 'owner-a', auditId: 'audit-a', confirmedKeys });
const tap = (id = keyA) => enqueue({ idempotencyKey: id, eventId: 'event-a', path: '/registrations', body: { idempotencyKey: id, category: 'TEST' } });
async function parked(id = keyA): Promise<OutboxEntry> {
  const row = await tap(id);
  const stored = { ...row, status: 'failed' as const };
  await (await outboxDatabase()).put(OUTBOX_STORE, stored);
  return stored;
}
beforeEach(async () => { owner(); await (await outboxDatabase()).clear(OUTBOX_STORE); vi.mocked(api).mockReset(); });
afterEach(async () => { clearSession(); await (await outboxDatabase()).clear(OUTBOX_STORE); });

describe('atomic outbox ownership and send claims', () => {
  it('serializes cancellation against a send claim: exactly one may win', async () => {
    await tap();
    const [cancelled, claim] = await Promise.all([cancel(keyA), claimEntry(keyA)]);
    expect(Number(cancelled) + Number(!!claim)).toBe(1);
    if (cancelled) expect(await listEntries()).toEqual([]);
    else expect((await listEntries())[0]?.status).toBe('sending');
  });
  it('a stale flush candidate cannot recreate a cancelled row', async () => {
    await tap();
    expect(await cancel(keyA)).toBe(true);
    expect(await claimEntry(keyA)).toBeNull();
    await flush({ force: true });
    expect(api).not.toHaveBeenCalled();
    expect(await listEntries()).toEqual([]);
  });
  it('two tab claims cannot send the same live row and sending cannot be cancelled', async () => {
    await tap();
    const claims = await Promise.all([claimEntry(keyA), claimEntry(keyA)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await cancel(keyA)).toBe(false);
    expect(await claimEntry(keyA)).toBeNull();
  });
  it('recovers an interrupted lease, and fences the older send outcome', async () => {
    await tap();
    const first = (await claimEntry(keyA))!;
    await (await outboxDatabase()).put(OUTBOX_STORE, { ...first.entry, claimedAt: new Date(Date.now() - 180_000).toISOString() });
    const second = (await claimEntry(keyA))!;
    expect(second.claimId).not.toBe(first.claimId);
    await settleClaim(first, null);
    expect((await listEntries())[0]?.claimId).toBe(second.claimId);
    await settleClaim(second, { ...second.entry, status: 'pending', attempts: 1 });
    expect((await listEntries())[0]).toMatchObject({ status: 'pending', attempts: 1 });
    expect((await listEntries())[0]).not.toHaveProperty('claimId');
  });
  it('preserves the first intent on duplicate enqueue and refuses a different body/key owner', async () => {
    const first = await tap();
    await tap();
    expect((await listEntries())[0]?.clientRecordedAt).toBe(first.clientRecordedAt);
    await expect(enqueue({ idempotencyKey: keyA, eventId: 'event-a', path: '/footfall/ticks', body: {} })).rejects.toThrow('another intent');
    owner('owner-b');
    expect(await cancel(keyA)).toBe(false);
    expect(await claimEntry(keyA)).toBeNull();
  });
  it('retains legacy ownerless attribution while upgrading paths atomically', async () => {
    await (await outboxDatabase()).put(OUTBOX_STORE, { id: keyA, endpoint: '/registrations', method: 'POST', body: {},
      clientRecordedAt: new Date().toISOString(), attempts: 0, lastAttemptAt: null, status: 'pending', lastError: null });
    expect(await upgradeLegacyEntries('event-a')).toBe(1);
    expect((await listEntries())[0]).toMatchObject({ endpoint: '/events/event-a/registrations', eventId: 'event-a' });
    expect(await claimEntry(keyA)).not.toBeNull();
  });
});

describe('audited selected-only parked capture recovery', () => {
  it('clears exactly the proved selected FAILED row and retains another failed and pending row', async () => {
    await parked(); await parked(keyB); await tap('33333333-3333-4333-8333-333333333333');
    expect(await clearConfirmedFailed(selection(), proof())).toBe(1);
    expect((await listEntries()).map((row) => row.id).sort()).toEqual([keyB, '33333333-3333-4333-8333-333333333333'].sort());
  });
  it.each([
    { eventId: 'event-b' }, { personId: 'owner-b' }, { auditId: '' }, { confirmedKeys: [keyB] },
    { confirmedKeys: [keyA, keyA] }, { confirmedKeys: [keyA, keyB] },
  ])('refuses incomplete or mismatched proof %j without deleting anything', async (override) => {
    await parked();
    await expect(clearConfirmedFailed(selection(), { ...proof(), ...override })).rejects.toThrow();
    expect(await listEntries()).toHaveLength(1);
  });
  it('rolls back the whole local selection when a later row is pending or sending', async () => {
    await parked(); await tap(keyB);
    await expect(clearConfirmedFailed(selection([keyA, keyB]), proof([keyA, keyB]))).rejects.toThrow('changed');
    expect(await listEntries()).toHaveLength(2);
    await claimEntry(keyB);
    await expect(clearConfirmedFailed(selection([keyA, keyB]), proof([keyA, keyB]))).rejects.toThrow('changed');
    expect(await listEntries()).toHaveLength(2);
  });
  it('does not clear an earlier session receipt under the next person on a shared phone', async () => {
    await parked(); const original = selection();
    owner('owner-b');
    await expect(clearConfirmedFailed(original, proof())).rejects.toThrow('session');
    expect(await listEntries()).toHaveLength(1);
  });
  it('refuses a row that became another event or owner after server confirmation', async () => {
    const row = await parked();
    await (await outboxDatabase()).put(OUTBOX_STORE, { ...row, eventId: 'event-b' });
    await expect(clearConfirmedFailed(selection(), proof())).rejects.toThrow('changed');
    await (await outboxDatabase()).put(OUTBOX_STORE, { ...row, ownerId: 'owner-b' });
    await expect(clearConfirmedFailed(selection(), proof())).rejects.toThrow('changed');
    expect(await listEntries()).toHaveLength(1);
  });
  it('maps only real supported capture paths; a group or forged event path stays parked', async () => {
    const row = await parked();
    expect(salvageCaptureKind(row)).toBe('registration');
    expect(salvageCaptureKind({ ...row, endpoint: '/events/event-a/cards/ABCD/stamps' })).toBe('stamp');
    expect(salvageCaptureKind({ ...row, endpoint: '/events/event-a/gifts/redemptions' })).toBe('redemption');
    expect(salvageCaptureKind({ ...row, endpoint: '/events/event-a/registrations/group' })).toBeNull();
    expect(salvageCaptureKind({ ...row, endpoint: '/events/event-b/registrations' })).toBeNull();
    expect(salvageCaptureKind({ ...row, eventId: undefined })).toBeNull();
  });
});
