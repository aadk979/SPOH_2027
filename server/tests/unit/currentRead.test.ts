import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import { NotFoundError, ServiceUnavailableError } from '../../src/platform/errors/index.js';
const mocks = vi.hoisted(() => ({ person: vi.fn(), membership: vi.fn(), forPerson: vi.fn(), forMembership: vi.fn(),
  decision: vi.fn(), built: vi.fn() }));
vi.mock('../../src/platform/access/authorizer/index.js', () => ({ EntityBuilder: class {
  constructor(...args: unknown[]) { mocks.built(...args); }
  forPerson = mocks.forPerson;
  forMembership = mocks.forMembership;
} }));
vi.mock('../../src/platform/access/engine.js', () => ({ currentAuthorizer: () => ({ isAuthorized: mocks.decision }) }));
import { canReadCurrent, createReadContext } from '../../src/platform/access/currentRead.js';
const db = { person: { findUnique: mocks.person }, eventMembership: { findFirst: mocks.membership } } as unknown as PrismaTransactionClient;
const input = { eventId: 'event', personId: 'person', membershipId: 'membership', now: new Date('2026-10-11T08:00:00Z'),
  action: 'Self.Read' as const, resource: { type: 'Membership' as const, id: 'membership' } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.person.mockResolvedValue({ deactivatedAt: null });
  mocks.membership.mockResolvedValue({ id: 'membership' });
  mocks.forMembership.mockResolvedValue({ request: 'membership' });
  mocks.forPerson.mockResolvedValue({ request: 'person' });
  mocks.decision.mockResolvedValue({ allowed: true, errors: [] });
});
describe('strict current reads', () => {
  it('binds each scoped membership to the authenticated person before consulting Cedar', async () => {
    expect(await canReadCurrent(db, input)).toBe(true);
    expect(mocks.membership).toHaveBeenCalledWith({ where: { id: 'membership', eventId: 'event', personId: 'person' }, select: { id: true } });
    expect(mocks.forMembership).toHaveBeenCalledWith('membership', { action: 'Self.Read', resource: input.resource, facts: {} });
    expect(mocks.decision).toHaveBeenCalledWith({ request: 'membership' });
  });
  it.each([null, { deactivatedAt: new Date() }])('denies absent/deactivated accounts before building facts', async (person) => {
    mocks.person.mockResolvedValue(person);
    expect(await canReadCurrent(db, input)).toBe(false);
    expect(mocks.built).not.toHaveBeenCalled();
  });
  it('denies absent or borrowed memberships and does not treat an engine error as permission', async () => {
    mocks.membership.mockResolvedValue(null);
    expect(await canReadCurrent(db, input)).toBe(false);
    expect(await canReadCurrent(db, { ...input, membershipId: undefined })).toBe(false);
    expect(mocks.decision).not.toHaveBeenCalled();
  });
  it('asks person authority without inventing membership or changing the resource', async () => {
    expect(await canReadCurrent(db, { ...input, asPerson: true, ip: '127.0.0.1' })).toBe(true);
    expect(mocks.membership).not.toHaveBeenCalled();
    expect(mocks.forPerson).toHaveBeenCalledWith('person', { action: 'Self.Read', resource: input.resource, facts: { ip: '127.0.0.1' } });
  });
  it('does not override archive/capture phase denials for a read', async () => {
    mocks.decision.mockResolvedValue({ allowed: false, errors: [], determiningPolicies: ['guardrail.archived-read-only'] });
    expect(await canReadCurrent(db, input)).toBe(false);
  });
  it('propagates policy evaluation errors even when another policy would allow', async () => {
    mocks.decision.mockResolvedValue({ allowed: true, errors: ['Skipped forbid'] });
    await expect(canReadCurrent(db, input)).rejects.toBeInstanceOf(ServiceUnavailableError);
    mocks.person.mockRejectedValue(new Error('Database unavailable'));
    await expect(canReadCurrent(db, input)).rejects.toMatchObject({ statusCode: 503 });
  });
  it('distinguishes missing resources from unavailable policy facts', async () => {
    mocks.forMembership.mockRejectedValue(new NotFoundError('Station'));
    expect(await canReadCurrent(db, input)).toBe(false);
    mocks.forMembership.mockRejectedValue(new Error('Policy unavailable'));
    await expect(canReadCurrent(db, input)).rejects.toMatchObject({ statusCode: 503 });
  });
  it('rebuilds current facts for every question on the same context', async () => {
    const context = createReadContext({ scope: { eventId: input.eventId }, personId: input.personId,
      membershipId: input.membershipId, now: input.now, db });
    expect(await context.canRead({ action: input.action, resource: input.resource })).toBe(true);
    mocks.membership.mockResolvedValue(null);
    expect(await context.canRead({ action: input.action, resource: input.resource })).toBe(false);
    expect(mocks.person).toHaveBeenCalledTimes(2);
    expect(mocks.decision).toHaveBeenCalledTimes(1);
  });
});
