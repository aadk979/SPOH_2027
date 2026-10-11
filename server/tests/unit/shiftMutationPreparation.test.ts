import { beforeEach, expect, it, vi } from 'vitest';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { prepareShiftWrite } from '../../src/modules/shift/application/prepareShiftWrite.js';
import {
  holdShiftReceipt,
  settleShiftReceipt,
} from '../../src/modules/shift/application/mutationReceipt.js';
import { holdCaptureEvent } from '../../src/platform/db/captureProvenance.js';
import { requireCurrentPermission } from '../../src/platform/access/currentPermission.js';
import { lockReserved, settleReserved } from '../../src/platform/idempotency/index.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';

vi.mock('../../src/platform/db/captureProvenance.js', () => ({ holdCaptureEvent: vi.fn() }));
vi.mock('../../src/platform/access/currentPermission.js', () => ({
  requireCurrentPermission: vi.fn(),
}));
vi.mock('../../src/platform/idempotency/index.js', () => ({
  lockReserved: vi.fn(),
  settleReserved: vi.fn(),
}));
const tx = {} as PrismaTransactionClient;
const scope = { eventId: 'event' };
const actor = { scope, membershipId: 'member', volunteerId: 'person', audit: SYSTEM_AUDIT_CONTEXT };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(holdCaptureEvent).mockResolvedValue({
    status: 'LIVE',
    closedAt: null,
    organisationId: 'org',
  });
});

it('takes a receipt fence and lifecycle lock before checking current scoped authority', async () => {
  await prepareShiftWrite(tx, {
    actor,
    key: 'key',
    action: 'Swap.Request',
    resource: { type: 'ShiftAssignment', id: 'assignment' },
  });
  expect(lockReserved).toHaveBeenCalledWith(tx, scope, 'key');
  expect(requireCurrentPermission).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({
      scope,
      membershipId: 'member',
      personId: 'person',
      action: 'Swap.Request',
      resource: { type: 'ShiftAssignment', id: 'assignment' },
    }),
  );
  expect(vi.mocked(lockReserved).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(holdCaptureEvent).mock.invocationCallOrder[0]!,
  );
  expect(vi.mocked(holdCaptureEvent).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(requireCurrentPermission).mock.invocationCallOrder[0]!,
  );
});
it('refuses archived writes itself because the authority helper skips phase guardrails', async () => {
  vi.mocked(holdCaptureEvent).mockResolvedValue({
    status: 'ARCHIVED',
    closedAt: null,
    organisationId: 'org',
  });
  await expect(
    prepareShiftWrite(tx, {
      actor,
      key: undefined,
      action: 'Briefing.Complete',
      resource: { type: 'BriefingSlot', id: 'slot' },
    }),
  ).rejects.toThrow(/read only/);
  expect(requireCurrentPermission).not.toHaveBeenCalled();
});
it('preserves legacy no-key callers and stores only the changed row id for a keyed receipt', async () => {
  await holdShiftReceipt(tx, scope, undefined);
  await settleShiftReceipt(tx, scope, { key: undefined, id: 'swap', statusCode: 201 });
  expect(lockReserved).not.toHaveBeenCalled();
  expect(settleReserved).not.toHaveBeenCalled();
  await settleShiftReceipt(tx, scope, { key: 'key', id: 'swap', statusCode: 201 });
  expect(settleReserved).toHaveBeenCalledWith(tx, scope, {
    key: 'key',
    statusCode: 201,
    body: { id: 'swap' },
  });
});
