import { ACTION_IDS } from '@spoh/access-policies';
import type { IsAuthorizedCommandInput } from '@aws-sdk/client-verifiedpermissions';
import { describe, expect, it, vi } from 'vitest';
import {
  AuthorizerUnavailableError,
  AvpAuthorizer,
  CircuitBreaker,
  createAuthorizer,
  DecisionCache,
  decisionKey,
  degradesToLocal,
  LocalCedarAuthorizer,
  ResilientAuthorizer,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type AvpClient,
} from '../../src/platform/access/authorizer/index.js';

const NS = 'SPOH';
const e = (type: string, id: string) => ({ type: `${NS}::${type}`, id });
const ref = (type: string, id: string) => ({ __entity: e(type, id) });

/** One event, one station, and a volunteer on shift there who may register visitors. */
function registration(
  overrides: { onShift?: string[]; phase?: string } = {},
): AuthorizationRequest {
  const event = e('Event', 'E1');
  return {
    principal: e('Membership', 'm1'),
    action: 'Registration.Create',
    resource: e('Station', 'S1'),
    context: {
      eventPhase: overrides.phase ?? 'LIVE',
      lateSyncAllowed: false,
      onTrustedNetwork: true,
    },
    eventId: 'E1',
    entities: [
      { uid: e('Organisation', 'org'), attrs: {}, parents: [] },
      { uid: event, attrs: {}, parents: [e('Organisation', 'org')] },
      { uid: e('Station', 'S1'), attrs: {}, parents: [event] },
      { uid: e('Person', 'p1'), attrs: { active: true, platformAdmin: false }, parents: [] },
      {
        uid: e('Role', 'E1/VOLUNTEER'),
        attrs: {
          catalogueRole: 'VOLUNTEER',
          rank: 10,
          grants: ['Registration.Create'],
          anyStation: false,
        },
        parents: [event],
      },
      {
        uid: e('Membership', 'm1'),
        attrs: {
          event: ref('Event', 'E1'),
          person: ref('Person', 'p1'),
          role: ref('Role', 'E1/VOLUNTEER'),
          rank: 10,
          active: true,
          assignedStations: [ref('Station', 'S1')],
          onShiftStations: (overrides.onShift ?? ['S1']).map((id) => ref('Station', id)),
          workingDays: [],
          attendanceVerifiedToday: true,
          isAttendanceRoot: false,
        },
        parents: [event],
      },
    ],
  };
}

const local = new LocalCedarAuthorizer();

function fakeClient(
  answer: (input: IsAuthorizedCommandInput, signal: AbortSignal) => Promise<unknown>,
): AvpClient & { calls: IsAuthorizedCommandInput[] } {
  const calls: IsAuthorizedCommandInput[] = [];
  return {
    calls,
    isAuthorized: (input, signal) => {
      calls.push(input);
      return answer(input, signal) as never;
    },
  };
}

const awsError = (name: string, fault: 'client' | 'server', status: number) =>
  Object.assign(new Error(name), { name, $fault: fault, $metadata: { httpStatusCode: status } });

describe('LocalCedarAuthorizer', () => {
  it('allows a volunteer on shift and names the deciding policy', () => {
    const decision = local.evaluate(registration());
    expect(decision).toMatchObject({ allowed: true, engine: 'local', errors: [] });
    expect(decision.determiningPolicies).toContain('grant.Registration.Create');
  });

  it('denies off shift through the station-scope guardrail', () => {
    const decision = local.evaluate(registration({ onShift: [] }));
    expect(decision.allowed).toBe(false);
    expect(decision.determiningPolicies.length).toBeGreaterThan(0);
  });

  it('denies, with the errors, a request that does not match the schema', async () => {
    const request = registration();
    const broken = {
      ...request,
      entities: request.entities.map((entity) =>
        (entity.uid as { id: string }).id === 'm1'
          ? { ...entity, attrs: { ...entity.attrs, rank: 'high' } }
          : entity,
      ),
    };
    const decision = await local.isAuthorized(broken);
    expect(decision.allowed).toBe(false);
    expect(decision.errors.length).toBeGreaterThan(0);
  });

  it('answers a batch in order', async () => {
    const decisions = await local.batch([registration(), registration({ onShift: [] })]);
    expect(decisions.map((decision) => decision.allowed)).toEqual([true, false]);
  });
});

describe('AvpAuthorizer', () => {
  it('sends the same Cedar JSON the local engine evaluates and maps the answer', async () => {
    const client = fakeClient(() =>
      Promise.resolve({
        decision: 'ALLOW',
        determiningPolicies: [{ policyId: 'p-1' }, { policyId: 'p-2' }],
        errors: [],
      }),
    );
    const avp = new AvpAuthorizer({
      client,
      policyStoreId: 'store-1',
      policyNames: { 'p-1': 'grant.Registration.Create' },
    });
    const request = registration();
    const decision = await avp.isAuthorized(request);
    expect(decision).toEqual({
      allowed: true,
      engine: 'avp',
      determiningPolicies: ['grant.Registration.Create', 'avp:p-2'],
      errors: [],
    });
    expect(client.calls[0]).toEqual({
      policyStoreId: 'store-1',
      principal: { entityType: 'SPOH::Membership', entityId: 'm1' },
      action: { actionType: 'SPOH::Action', actionId: 'Registration.Create' },
      resource: { entityType: 'SPOH::Station', entityId: 'S1' },
      context: { cedarJson: JSON.stringify(request.context) },
      entities: { cedarJson: JSON.stringify(request.entities) },
    });
  });

  it('denies an ALLOW that carries evaluation errors', async () => {
    const client = fakeClient(() =>
      Promise.resolve({ decision: 'ALLOW', errors: [{ errorDescription: 'forbid errored' }] }),
    );
    const decision = await new AvpAuthorizer({ client, policyStoreId: 's' }).isAuthorized(
      registration(),
    );
    expect(decision).toMatchObject({ allowed: false, errors: ['forbid errored'] });
  });

  it('retries a throttle once, then answers', async () => {
    let calls = 0;
    const client = fakeClient(() =>
      calls++ === 0
        ? Promise.reject(awsError('ThrottlingException', 'client', 429))
        : Promise.resolve({ decision: 'DENY', determiningPolicies: [] }),
    );
    const decision = await new AvpAuthorizer({ client, policyStoreId: 's' }).isAuthorized(
      registration(),
    );
    expect(decision.allowed).toBe(false);
    expect(client.calls).toHaveLength(2);
  });

  it('gives up after one retry of a server fault, as unavailable rather than denied', async () => {
    const client = fakeClient(() =>
      Promise.reject(awsError('InternalServerException', 'server', 500)),
    );
    await expect(
      new AvpAuthorizer({ client, policyStoreId: 's' }).isAuthorized(registration()),
    ).rejects.toMatchObject({ statusCode: 503, details: { reason: 'avp-unavailable' } });
    expect(client.calls).toHaveLength(2);
  });

  it('times out a slow answer, aborts it, and retries', async () => {
    const signals: AbortSignal[] = [];
    const client = fakeClient((_, signal) => {
      signals.push(signal);
      return new Promise(() => undefined);
    });
    const avp = new AvpAuthorizer({ client, policyStoreId: 's', timeoutMs: 5 });
    await expect(avp.isAuthorized(registration())).rejects.toBeInstanceOf(
      AuthorizerUnavailableError,
    );
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('does not retry a missing store or a denied role', async () => {
    const client = fakeClient(() =>
      Promise.reject(awsError('ResourceNotFoundException', 'client', 404)),
    );
    await expect(
      new AvpAuthorizer({ client, policyStoreId: 's' }).isAuthorized(registration()),
    ).rejects.toBeInstanceOf(AuthorizerUnavailableError);
    expect(client.calls).toHaveLength(1);
  });

  it('denies a request AVP refuses as invalid, without retrying', async () => {
    const client = fakeClient(() => Promise.reject(awsError('ValidationException', 'client', 400)));
    const decision = await new AvpAuthorizer({ client, policyStoreId: 's' }).isAuthorized(
      registration(),
    );
    expect(decision).toMatchObject({ allowed: false, engine: 'avp' });
    expect(decision.errors).toEqual(['ValidationException']);
    expect(client.calls).toHaveLength(1);
  });

  it('answers a batch with single calls', async () => {
    const client = fakeClient(() => Promise.resolve({ decision: 'ALLOW' }));
    const decisions = await new AvpAuthorizer({ client, policyStoreId: 's' }).batch([
      registration(),
      registration(),
    ]);
    expect(decisions.map((decision) => decision.allowed)).toEqual([true, true]);
    expect(client.calls).toHaveLength(2);
  });
});

describe('CircuitBreaker', () => {
  it('opens after five failures in ten seconds, probes once after thirty, and closes', () => {
    let now = 0;
    const breaker = new CircuitBreaker({ now: () => now });
    for (let i = 0; i < 4; i += 1) breaker.failure();
    expect(breaker.state).toBe('closed');
    breaker.failure();
    expect(breaker.state).toBe('open');
    expect(breaker.tryAcquire()).toBe(false);
    now = 30_000;
    expect(breaker.tryAcquire()).toBe(true);
    expect(breaker.tryAcquire()).toBe(false);
    breaker.success();
    expect(breaker.state).toBe('closed');
  });

  it('forgets failures older than the window', () => {
    let now = 0;
    const breaker = new CircuitBreaker({ now: () => now });
    for (let i = 0; i < 4; i += 1) breaker.failure();
    now = 10_000;
    breaker.failure();
    expect(breaker.state).toBe('closed');
  });

  it('opens again when the probe fails', () => {
    let now = 0;
    const breaker = new CircuitBreaker({ now: () => now, failureThreshold: 1 });
    breaker.failure();
    now = 30_000;
    expect(breaker.tryAcquire()).toBe(true);
    breaker.failure();
    expect(breaker.state).toBe('open');
  });
});

describe('DecisionCache', () => {
  const allow: AuthorizationDecision = {
    allowed: true,
    engine: 'avp',
    determiningPolicies: [],
    errors: [],
  };

  it('keys on the complete input, whatever order objects were built in', () => {
    const request = registration();
    const reordered = {
      ...request,
      context: Object.fromEntries(Object.entries(request.context).reverse()),
    };
    expect(decisionKey(reordered)).toBe(decisionKey(request));
    expect(decisionKey(registration({ onShift: [] }))).not.toBe(decisionKey(request));
    expect(decisionKey(registration({ phase: 'CLOSED' }))).not.toBe(decisionKey(request));
  });

  it('keeps writes for 30 s and reads for 60 s', () => {
    let now = 0;
    const cache = new DecisionCache({ now: () => now });
    const write = registration();
    const read = { ...registration(), action: 'Dashboard.ReadStation' as const };
    cache.set(write, allow);
    cache.set(read, allow);
    now = 29_999;
    expect(cache.get(write)).toBe(allow);
    now = 30_000;
    expect(cache.get(write)).toBeUndefined();
    expect(cache.get(read)).toBe(allow);
    now = 60_000;
    expect(cache.get(read)).toBeUndefined();
  });

  it('never keeps a decision with errors', () => {
    const cache = new DecisionCache();
    cache.set(registration(), { ...allow, allowed: false, errors: ['x'] });
    expect(cache.size).toBe(0);
  });

  it('drops the oldest entry beyond its bound', () => {
    const cache = new DecisionCache({ maxEntries: 1 });
    cache.set(registration(), allow);
    cache.set(registration({ phase: 'REHEARSAL' }), allow);
    expect(cache.size).toBe(1);
    expect(cache.get(registration())).toBeUndefined();
  });

  it('clears an event on the access and membership channels', () => {
    const listeners = new Map<string, (payload: Record<string, unknown>) => void>();
    const cache = new DecisionCache();
    cache.subscribe((channel, listener) => listeners.set(channel, listener));
    expect([...listeners.keys()].sort()).toEqual(['access', 'membership']);
    const other = { ...registration({ phase: 'REHEARSAL' }), eventId: 'E2' };
    cache.set(registration(), allow);
    cache.set(other, allow);
    listeners.get('access')?.({ eventId: 'E1' });
    expect(cache.get(registration())).toBeUndefined();
    expect(cache.get(other)).toBe(allow);
    listeners.get('membership')?.({});
    expect(cache.size).toBe(0);
  });
});

describe('degraded mode', () => {
  it('runs only Capture, Self, Safety reports and raises, and Report and Safety reads locally', () => {
    expect(ACTION_IDS.filter(degradesToLocal)).toEqual([
      'Alert.Ack',
      'Announcement.Ack',
      'Attendance.IssueCode',
      'Attendance.Submit',
      'Audit.Read',
      'Briefing.Complete',
      'Card.Stamp',
      'Dashboard.ReadEvent',
      'Dashboard.ReadStation',
      'Footfall.Create',
      'Gift.Redeem',
      'Incident.Read',
      'Incident.Report',
      'LostPerson.Raise',
      'People.Read',
      'Registration.Create',
      'Report.Export',
      'Report.Generate',
      'Roster.ReadStation',
      'Self.Read',
      'Shift.CheckIn',
      'Structure.Read',
      'Swap.Request',
      'VisitorRecord.Read',
    ]);
  });

  const unavailable = () =>
    fakeClient(() => Promise.reject(awsError('InternalServerException', 'server', 503)));

  it('answers a capture from the local engine and logs it', async () => {
    const log = { warn: vi.fn() };
    const avp = new AvpAuthorizer({ client: unavailable(), policyStoreId: 's', retries: 0 });
    const authorizer = new ResilientAuthorizer({ primary: avp, local, log });
    const decision = await authorizer.isAuthorized(registration());
    expect(decision).toMatchObject({ allowed: true, engine: 'local' });
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ authz: expect.objectContaining({ engine: 'local' }) }),
      'authorization degraded to the local engine',
    );
    expect(authorizer.cache.size).toBe(0);
  });

  it('fails closed with a 503 for a correction', async () => {
    const avp = new AvpAuthorizer({ client: unavailable(), policyStoreId: 's', retries: 0 });
    const authorizer = new ResilientAuthorizer({ primary: avp, local, log: { warn: vi.fn() } });
    const voiding = { ...registration(), action: 'Record.Void' as const };
    await expect(authorizer.isAuthorized(voiding)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('stops calling AVP while the circuit is open', async () => {
    const client = unavailable();
    const avp = new AvpAuthorizer({ client, policyStoreId: 's', retries: 0 });
    const authorizer = new ResilientAuthorizer({ primary: avp, local, log: { warn: vi.fn() } });
    for (let i = 0; i < 7; i += 1) await authorizer.isAuthorized(registration());
    expect(client.calls).toHaveLength(5);
    expect(authorizer.breaker.state).toBe('open');
  });

  it('caches AVP answers and serves the repeat without calling it', async () => {
    const client = fakeClient(() => Promise.resolve({ decision: 'ALLOW' }));
    const avp = new AvpAuthorizer({ client, policyStoreId: 's' });
    const authorizer = new ResilientAuthorizer({ primary: avp, local, log: { warn: vi.fn() } });
    await authorizer.batch([registration(), registration()]);
    await authorizer.isAuthorized(registration());
    expect(client.calls.length).toBeLessThanOrEqual(2);
    expect(authorizer.cache.size).toBe(1);
  });

  it('passes on an unexpected error rather than degrading', async () => {
    const primary = { isAuthorized: () => Promise.reject(new TypeError('bug')), batch: vi.fn() };
    const authorizer = new ResilientAuthorizer({ primary, local, log: { warn: vi.fn() } });
    await expect(authorizer.isAuthorized(registration())).rejects.toBeInstanceOf(TypeError);
  });
});

describe('createAuthorizer', () => {
  const setup = { region: 'ap-southeast-1', log: { warn: vi.fn() }, subscribe: vi.fn() };

  it('is the local engine where no policy store is configured', () => {
    expect(createAuthorizer({ ...setup, policyStoreId: null })).toBeInstanceOf(
      LocalCedarAuthorizer,
    );
  });

  it('is AVP behind the cache, subscribed to the bus, where one is', () => {
    const subscribe = vi.fn();
    const authorizer = createAuthorizer({
      ...setup,
      subscribe,
      policyStoreId: 'store',
      client: fakeClient(() => Promise.resolve({ decision: 'DENY' })),
    });
    expect(authorizer).toBeInstanceOf(ResilientAuthorizer);
    expect(subscribe.mock.calls.map(([channel]) => channel)).toEqual(['access', 'membership']);
  });
});
