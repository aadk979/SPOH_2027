import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadContext } from '../../src/platform/access/currentRead.js';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { ForbiddenError, ServiceUnavailableError } from '../../src/platform/errors/index.js';
const repos = vi.hoisted(() => ({ workspaceFoundItem: vi.fn(), countWorkspaceFoundItems: vi.fn(), foundCursor: vi.fn(),
  foundSearchMode: vi.fn(), searchWorkspaceFoundItems: vi.fn(), workspaceFoundPage: vi.fn(),
  auditCursor: vi.fn(), countWorkspaceAudit: vi.fn(), searchWorkspaceAudit: vi.fn(), workspaceAuditPage: vi.fn(), workspaceAuditRow: vi.fn() }));
vi.mock('../../src/modules/lostFound/data/workspaceRepo.js', () => repos);
vi.mock('../../src/modules/audit/data/workspaceRepo.js', () => repos);
import { lostFoundWorkspaceSource } from '../../src/modules/lostFound/application/workspace.js';
import { createAuditWorkspaceSource } from '../../src/modules/audit/application/workspace.js';
const now = new Date('2028-05-12T10:00:00Z');
function context(actions: string[] = ['Self.Read']): ReadContext {
  return { scope: { eventId: 'event' }, personId: 'reader', membershipId: 'member', now,
    db: { eventMembership: { findFirst: vi.fn(async () => ({ id: 'member' })) } } as unknown as PrismaTransactionClient,
    canRead: vi.fn(async (question) => actions.includes(question.action)) };
}
const item = { id: 'item', itemLabel: 'Bottle', categoryLabel: 'Bottle', foundStationId: 'station', foundAt: now,
  holderNote: 'At desk', status: 'HELD' as const, loggedById: 'colleague', claimedAt: null, rehearsal: false, photoKey: 'private/storage-key' };
const audit = { id: 'audit', actorId: 'colleague', action: 'registration.void', severity: 'INFO' as const,
  outcome: 'SUCCESS' as const, source: 'USER' as const, entityType: 'Registration', entityId: 'record', createdAt: now };
beforeEach(() => vi.resetAllMocks());

describe('operational found-item source boundaries', () => {
  it('checks current membership before fetching operational item details', async () => {
    await expect(lostFoundWorkspaceSource.entity(context([]), { kind: 'lost-found', id: 'item' })).rejects.toMatchObject({ statusCode: 403 });
    expect(repos.workspaceFoundItem).not.toHaveBeenCalled();
  });
  it('shows a photo action without returning any storage key or unauthorized person link', async () => {
    repos.workspaceFoundItem.mockResolvedValue(item);
    const result = await lostFoundWorkspaceSource.entity(context(), { kind: 'lost-found', id: 'item' });
    expect(JSON.stringify(result)).not.toContain('private/storage-key');
    expect(result?.actions).toEqual([{ label: 'View item photo', destination: { type: 'action', path: '/safety/lost-found', query: { id: 'item' } } }]);
    expect(result?.related).toEqual([{ label: 'Station', destination: { type: 'entity', target: { kind: 'station', id: 'station' } } }]);
  });
  it('does not expose a claim action after the item was claimed', async () => {
    repos.workspaceFoundItem.mockResolvedValue({ ...item, status: 'CLAIMED', claimedAt: now, photoKey: null });
    const result = await lostFoundWorkspaceSource.entity(context(['Self.Read', 'LostFound.Claim']), { kind: 'lost-found', id: 'item' });
    expect(result?.actions).toEqual([]);
  });
  it('rejects another-person filter before counting or paging operational records', async () => {
    await expect(lostFoundWorkspaceSource.records!(context(), { filter: { kind: 'lost-found', personId: 'colleague' }, limit: 5 }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(repos.countWorkspaceFoundItems).not.toHaveBeenCalled();
  });
  it('validates a cursor against the same station, status, pool and observation predicates', async () => {
    repos.foundCursor.mockResolvedValue(null);
    const filter = { kind: 'lost-found' as const, stationId: 'station', rehearsal: true, status: 'HELD' as const,
      from: '2028-05-12T09:00:00Z', to: '2028-05-12T11:00:00Z', asOf: now.toISOString() };
    await expect(lostFoundWorkspaceSource.records!(context(), { filter, cursor: 'foreign', limit: 5 })).rejects.toMatchObject({ statusCode: 404 });
    expect(repos.foundCursor.mock.calls[0]?.[2]).toMatchObject({ filter, pool: { rehearsal: true }, time: { lte: now }, cursor: 'foreign' });
    expect(repos.countWorkspaceFoundItems).not.toHaveBeenCalled();
  });
  it('reports the full filtered count rather than the visible page length', async () => {
    repos.countWorkspaceFoundItems.mockResolvedValue(7);
    repos.workspaceFoundPage.mockResolvedValue([item, { ...item, id: 'next' }]);
    const result = await lostFoundWorkspaceSource.records!(context(), { filter: { kind: 'lost-found', includeRehearsal: true }, limit: 1 });
    expect(result.aggregate).toEqual({ value: 7, unit: 'items' });
    expect(result.meta).toEqual({ count: 7, nextCursor: 'item' });
    expect(JSON.stringify(result)).not.toContain('private/storage-key');
  });
});

describe('safe event-only audit workspace source', () => {
  it('requires actual event Audit.Read before loading audit rows', async () => {
    await expect(createAuditWorkspaceSource().entity(context(), { kind: 'audit', id: 'audit' })).rejects.toMatchObject({ statusCode: 403 });
    expect(repos.workspaceAuditRow).not.toHaveBeenCalled();
  });
  it('projects only the whitelisted operational summary even if a repository accidentally supplies extra fields', async () => {
    repos.workspaceAuditRow.mockResolvedValue({ ...audit, before: { email: 'private@example.test' }, after: { phone: 'secret' },
      ip: 'secret-ip', userAgent: 'secret-agent', actorSub: 'secret-sub' });
    const result = await createAuditWorkspaceSource().entity(context(['Audit.Read']), { kind: 'audit', id: 'audit' });
    expect(result?.fields.map((entry) => entry.label)).toEqual(['Action', 'Outcome', 'Severity', 'Source', 'Entity type', 'Entity reference', 'Recorded']);
    expect(JSON.stringify(result)).not.toMatch(/private@example|secret|before|after|actorSub|userAgent/);
    expect(result?.related).toEqual([]);
  });
  it('links a supported target only after its source reader proves current authority and scoped existence', async () => {
    repos.workspaceAuditRow.mockResolvedValue(audit);
    const reader = vi.fn(async () => ({ ref: { kind: 'registration' as const, id: 'record' }, title: 'Registration', fields: [], facets: [],
      related: [], actions: [], asOf: now.toISOString() }));
    const result = await createAuditWorkspaceSource(reader).entity(context(['Audit.Read']), { kind: 'audit', id: 'audit' });
    expect(reader).toHaveBeenCalledWith(expect.anything(), { kind: 'registration', id: 'record' });
    expect(result?.related).toEqual([{ label: 'Entity: Registration', destination: { type: 'entity', target: { kind: 'registration', id: 'record' } } }]);
  });
  it.each(['unsupported', 'erased', 'denied'] as const)('retains honest non-links for %s targets', async (caseName) => {
    repos.workspaceAuditRow.mockResolvedValue({ ...audit, entityType: caseName === 'unsupported' ? 'RefreshSession' : 'Registration' });
    const reader = vi.fn(async () => { if (caseName === 'denied') throw new ForbiddenError(); return null; });
    const result = await createAuditWorkspaceSource(reader).entity(context(['Audit.Read']), { kind: 'audit', id: 'audit' });
    expect(result?.related).toEqual([]);
    if (caseName === 'unsupported') expect(reader).not.toHaveBeenCalled();
  });
  it('fails closed when destination policy evaluation is unavailable instead of silently removing the link', async () => {
    repos.workspaceAuditRow.mockResolvedValue(audit);
    await expect(createAuditWorkspaceSource(async () => { throw new ServiceUnavailableError('Policy unavailable'); })
      .entity(context(['Audit.Read']), { kind: 'audit', id: 'audit' })).rejects.toMatchObject({ statusCode: 503 });
  });
  it('refuses a cursor outside the filtered event rows before returning a count', async () => {
    repos.auditCursor.mockResolvedValue(null);
    await expect(createAuditWorkspaceSource().records!(context(['Audit.Read']),
      { filter: { kind: 'audit', action: 'registration.void', entityType: 'Registration', personId: 'actor' }, cursor: 'global-row', limit: 5 }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(repos.countWorkspaceAudit).not.toHaveBeenCalled();
  });
});
