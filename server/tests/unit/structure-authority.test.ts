import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '../../src/platform/http/auditContext.js';
const fake = vi.hoisted(() => ({
  tx: {},
  permission: vi.fn(),
  event: vi.fn(),
  lock: vi.fn(),
  settle: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../../src/platform/db/client.js', () => ({ prisma: { $transaction: fake.transaction } }));
vi.mock('../../src/platform/access/currentPermission.js', () => ({
  requireCurrentPermission: fake.permission,
}));
vi.mock('../../src/platform/audit/index.js', () => ({ writeAudit: fake.audit }));
vi.mock('../../src/platform/idempotency/index.js', () => ({
  lockReserved: fake.lock,
  settleReserved: fake.settle,
}));
vi.mock('../../src/modules/structure/data/metadataRepo.js', () => ({
  lockStructureEvent: fake.event,
}));
import {
  mutateStructure,
  requireStructureChange,
  requireStructureEdit,
} from '../../src/modules/structure/application/mutation.js';
const actor: ActorContext = {
  scope: { eventId: 'event' },
  volunteerId: 'person',
  membershipId: 'member',
  audit: {
    actorId: 'person',
    actorSub: 'sub',
    eventId: 'event',
    membershipId: 'member',
    ip: null,
    userAgent: null,
    requestId: 'request',
  },
};
const options = {
  actor,
  action: 'Structure.Change' as const,
  key: 'receipt',
  auditAction: 'stationType.create' as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  fake.event.mockResolvedValue({ status: 'DRAFT', timezone: 'Asia/Singapore' });
  fake.permission.mockResolvedValue(undefined);
  fake.lock.mockResolvedValue(undefined);
  fake.settle.mockResolvedValue(undefined);
  fake.audit.mockResolvedValue(undefined);
  fake.transaction.mockImplementation((work) => work(fake.tx));
});
describe('structure mutation authority and receipts', () => {
  it('checks the current member, fences the receipt, then audits and settles inside the effect transaction', async () => {
    const work = vi
      .fn()
      .mockResolvedValue({
        data: { id: 'type' },
        entityType: 'StationType',
        entityId: 'type',
        after: { label: 'Type' },
      });
    await expect(mutateStructure(options, work)).resolves.toEqual({ data: { id: 'type' } });
    expect(fake.permission).toHaveBeenCalledWith(
      fake.tx,
      expect.objectContaining({ action: 'Structure.Change', membershipId: 'member' }),
    );
    expect(fake.lock.mock.invocationCallOrder[0]).toBeLessThan(work.mock.invocationCallOrder[0]!);
    expect(fake.audit.mock.invocationCallOrder[0]).toBeLessThan(
      fake.settle.mock.invocationCallOrder[0]!,
    );
    expect(fake.settle).toHaveBeenCalledWith(fake.tx, actor.scope, {
      key: 'receipt',
      statusCode: 201,
      body: { data: { id: 'type' } },
    });
  });
  it.each(['LIVE', 'CLOSED', 'ARCHIVED'])(
    'refuses initial structure at %s before effects',
    async (status) => {
      fake.event.mockResolvedValue({ status, timezone: 'Asia/Singapore' });
      const work = vi.fn();
      await expect(mutateStructure(options, work)).rejects.toThrow('event stage');
      expect(work).not.toHaveBeenCalled();
      expect(fake.lock).not.toHaveBeenCalled();
    },
  );
  it('settles labels/deactivation at 200 and supports explicitly chosen removal status', async () => {
    const work = vi
      .fn()
      .mockResolvedValue({
        data: { id: 'item' },
        entityType: 'StationType',
        entityId: 'item',
        before: {},
        after: {},
      });
    fake.event.mockResolvedValue({ status: 'LIVE', timezone: 'Asia/Singapore' });
    await mutateStructure({ ...options, action: 'Structure.Edit' }, work);
    expect(fake.settle).toHaveBeenLastCalledWith(
      fake.tx,
      actor.scope,
      expect.objectContaining({ statusCode: 200 }),
    );
    fake.event.mockResolvedValue({ status: 'DRAFT', timezone: 'Asia/Singapore' });
    await mutateStructure({ ...options, statusCode: 200 }, work);
    expect(fake.settle).toHaveBeenLastCalledWith(
      fake.tx,
      actor.scope,
      expect.objectContaining({ statusCode: 200 }),
    );
  });
  it('refuses a disappeared event and a revoked permission before work', async () => {
    const work = vi.fn();
    fake.event.mockResolvedValue(undefined);
    await expect(mutateStructure(options, work)).rejects.toThrow('Event not found');
    fake.event.mockResolvedValue({ status: 'DRAFT', timezone: 'Asia/Singapore' });
    fake.permission.mockRejectedValueOnce(new Error('Role was revoked'));
    await expect(mutateStructure(options, work)).rejects.toThrow('Role was revoked');
    expect(work).not.toHaveBeenCalled();
  });
  it('does not audit or settle a failed fence or failed effect', async () => {
    const work = vi.fn().mockRejectedValue(new Error('Effect failed'));
    fake.lock.mockRejectedValueOnce(new Error('Receipt was replaced'));
    await expect(mutateStructure(options, work)).rejects.toThrow('Receipt was replaced');
    expect(work).not.toHaveBeenCalled();
    await expect(mutateStructure(options, work)).rejects.toThrow('Effect failed');
    expect(fake.audit).not.toHaveBeenCalled();
    expect(fake.settle).not.toHaveBeenCalled();
  });
  it.each([requireStructureChange, requireStructureEdit])(
    'rejects a missing event in a legacy mutation authority guard',
    async (check) => {
      fake.event.mockResolvedValue(undefined);
      await expect(
        check(actor, fake.tx as Parameters<typeof requireStructureEdit>[1]),
      ).rejects.toThrow('Event not found');
    },
  );
  it('checks live/current guards on legacy edits and structural writes', async () => {
    const tx = fake.tx as Parameters<typeof requireStructureEdit>[1];
    await requireStructureChange(actor, tx);
    await requireStructureEdit(actor, tx);
    fake.event.mockResolvedValue({ status: 'LIVE', timezone: 'Asia/Singapore' });
    await expect(requireStructureChange(actor, tx)).rejects.toThrow('frozen');
    await expect(requireStructureEdit(actor, tx)).resolves.toBeUndefined();
    fake.event.mockResolvedValue({ status: 'ARCHIVED', timezone: 'Asia/Singapore' });
    await expect(requireStructureEdit(actor, tx)).rejects.toThrow('read-only');
  });
});
