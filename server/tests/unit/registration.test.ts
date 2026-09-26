import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expandGroupMembers } from '../../src/modules/registration/domain/groupMembers.js';
import { assertNotVoided } from '../../src/modules/registration/domain/voiding.js';

/** Registration rules and the void use case (P06.5), without a database. */

vi.mock('../../src/modules/registration/data/repo.js', () => ({
  findRegistrationById: vi.fn(),
  voidRegistration: vi.fn(),
}));
vi.mock('../../src/platform/db/client.js', () => ({
  prisma: { $transaction: vi.fn((work: (tx: unknown) => unknown) => work({})) },
}));
vi.mock('../../src/platform/audit/index.js', () => ({ writeAudit: vi.fn() }));

const repo = vi.mocked(await import('../../src/modules/registration/data/repo.js'));
const { writeAudit } = vi.mocked(await import('../../src/platform/audit/index.js'));
const { voidRegistrationById } =
  await import('../../src/modules/registration/application/voidRegistrationById.js');

const CONTEXT = {
  stationId: 'st1',
  recordedById: 'v1',
  groupId: 'g1',
  missionCardId: null,
  recordedAt: new Date('2027-01-07T03:30:00.000Z'),
  clientRecordedAt: null,
};

const AUDIT = { actorId: 'ic', actorSub: 'sub', ip: null, userAgent: null, requestId: 'r1' };

describe('expandGroupMembers', () => {
  it('makes one row per person, each with its own idempotency key', () => {
    const rows = expandGroupMembers(
      {
        idempotencyKey: 'k',
        members: [
          { category: 'SEC_3', count: 2 },
          { category: 'SEC_4', count: 1 },
        ],
      },
      CONTEXT,
    );

    expect(rows.map((row) => [row.category, row.idempotencyKey])).toEqual([
      ['SEC_3', 'k:SEC_3:0'],
      ['SEC_3', 'k:SEC_3:1'],
      ['SEC_4', 'k:SEC_4:0'],
    ]);
    expect(rows.every((row) => row.groupId === 'g1' && row.source === 'APP')).toBe(true);
  });
});

describe('assertNotVoided', () => {
  it('passes a live registration and refuses a voided one', () => {
    expect(() => assertNotVoided({ voided: false })).not.toThrow();
    expect(() => assertNotVoided({ voided: true })).toThrow(
      expect.objectContaining({ code: 'ALREADY_VOIDED', statusCode: 409 }),
    );
  });
});

describe('voidRegistrationById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('voids and audits with the before and after state', async () => {
    repo.findRegistrationById.mockResolvedValueOnce({
      id: 'r',
      voided: false,
      category: 'SEC_3',
    } as never);
    repo.voidRegistration.mockResolvedValueOnce({ voidedReason: 'mis-tap' } as never);

    await voidRegistrationById('r', 'mis-tap', AUDIT);

    expect(repo.voidRegistration).toHaveBeenCalledWith({}, 'r', 'mis-tap');
    expect(writeAudit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        action: 'registration.void',
        before: { voided: false, category: 'SEC_3' },
        after: { voided: true, voidedReason: 'mis-tap' },
      }),
    );
  });

  it('refuses a missing registration with 404 and writes nothing', async () => {
    repo.findRegistrationById.mockResolvedValueOnce(null);

    await expect(voidRegistrationById('r', 'x', AUDIT)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.voidRegistration).not.toHaveBeenCalled();
  });
});
