import type { Request, Response } from 'express';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../src/platform/errors/index.js';
import { authorizeAll } from '../../src/platform/http/authorize.js';
import { drainTally } from '../../src/platform/http/decisionTally.js';

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  decide: vi.fn(),
  error: vi.fn(),
  denial: vi.fn(),
}));
vi.mock('../../src/platform/db/client.js', () => ({ prisma: {} }));
vi.mock('../../src/platform/access/authorizer/index.js', () => ({
  databaseRoleGrants: {},
  EntityBuilder: class {
    forMembership = mocks.build;
    forPerson = mocks.build;
  },
}));
vi.mock('../../src/platform/access/engine.js', () => ({
  currentAuthorizer: () => ({ isAuthorized: mocks.decide }),
  USE_CASE_PHASE_GUARDRAILS: new Set(),
}));
vi.mock('../../src/platform/http/requireAuth.js', () => ({
  getAuth: () => ({
    eventId: 'synthetic-event',
    volunteerId: 'synthetic-person',
    membershipId: 'synthetic-membership',
  }),
}));
vi.mock('../../src/platform/idempotency/index.js', () => ({ hasSettledAnswer: vi.fn() }));
vi.mock('../../src/platform/logger/index.js', () => ({ logger: { error: mocks.error } }));
vi.mock('../../src/platform/http/authorizationDenials.js', () => ({ recordDenial: mocks.denial }));

beforeEach(() => {
  vi.clearAllMocks();
  drainTally();
  mocks.build.mockResolvedValue({});
  mocks.decide.mockResolvedValue({ allowed: true, determiningPolicies: [], errors: [] });
});
const request = {
  method: 'POST',
  baseUrl: '/api/v1/events/synthetic-event/lifecycle',
  route: { path: '/' },
  body: {},
} as Request;
async function resourceFailure(cause: unknown) {
  const response = { locals: {} } as Response;
  return new Promise<unknown>((resolve) => {
    authorizeAll('Event.Transition', () => {
      throw cause;
    })(request, response, (error) => resolve(error));
  });
}
it.each([
  ['missing lifecycle target', () => new ValidationError('Missing to')],
  ['wrong lifecycle target type', () => new ValidationError('to must be text')],
  ['unknown lifecycle target', () => new ValidationError('Unknown lifecycle target OTHER')],
  ['missing scoped resource', () => new NotFoundError('Station')],
  ['resource conflict', () => new ConflictError('CONFLICT', 'Resource changed')],
  ['explicit client refusal', () => new AppError(403, 'FORBIDDEN', 'Resource refused')],
])(
  'keeps %s as a client refusal without firing the authorization outage metric',
  async (_label, make) => {
    const cause = make();
    expect(await resourceFailure(cause)).toBe(cause);
    expect(drainTally()).toEqual({ allowed: 0, denied: 0, unaskable: 1, failed: 0 });
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.denial).not.toHaveBeenCalled();
  },
);
it.each([
  ['ordinary exception', () => new Error('Dependency unavailable')],
  [
    'explicit server error',
    () => new AppError(503, 'SERVICE_UNAVAILABLE', 'Dependency unavailable'),
  ],
  ['non-error rejection', () => null],
])('retains the outage metric and closed refusal for %s', async (_label, make) => {
  expect(await resourceFailure(make())).toMatchObject({
    statusCode: 503,
    code: 'SERVICE_UNAVAILABLE',
  });
  expect(drainTally()).toEqual({ allowed: 0, denied: 0, unaskable: 0, failed: 1 });
  expect(mocks.error).toHaveBeenCalledOnce();
  expect(mocks.denial).not.toHaveBeenCalled();
});
it('continues counting an actual provider evaluation outage as failed', async () => {
  mocks.decide.mockRejectedValueOnce(new Error('AVP unavailable'));
  const error = await new Promise<unknown>((resolve) => {
    authorizeAll('Self.Read', () => [
      { action: 'Self.Read', resource: { type: 'Membership', id: 'synthetic-membership' } },
    ])(request, { locals: {} } as Response, (error) => resolve(error));
  });
  expect(error).toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  expect(mocks.decide).toHaveBeenCalledOnce();
  expect(drainTally()).toEqual({ allowed: 0, denied: 0, unaskable: 0, failed: 1 });
  expect(mocks.error).toHaveBeenCalledOnce();
});
