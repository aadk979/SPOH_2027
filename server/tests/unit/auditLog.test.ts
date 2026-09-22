import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditQuery } from '@spoh/shared';

/**
 * The audit trail's own rules.
 *
 * Three properties are worth a test, and they are the three that would fail
 * silently: the grading that decides what an admin sees under "needs a look",
 * the dedupe that stops an unauthenticated loop from filling the table, and
 * the query contract that stops anyone asking for all of it at once.
 */

// `recordSecurityEvent` writes through Prisma. The middleware's behaviour —
// what it records and how often — is what is under test here, not the write.
const recorded: Array<Record<string, unknown>> = [];

vi.mock('../../src/lib/audit.js', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/lib/audit.js')>('../../src/lib/audit.js');

  return {
    ...actual,
    recordSecurityEvent: (entry: Record<string, unknown>) => {
      recorded.push(entry);
    },
  };
});

const { severityOf, outcomeOf } = await import('../../src/lib/audit.js');
const { AUDIT_ACTIONS } = await import('../../src/modules/audit/actions.js');
const { auditRefusal, auditUntrustedOrigin, resetSecurityAuditWindows } =
  await import('../../src/middleware/securityAudit.js');
const { parseEnv } = await import('../../src/config/env.js');

/** The slice of Express the middleware actually touches. */
function request(overrides: Record<string, unknown> = {}): never {
  return {
    method: 'POST',
    path: '/registrations',
    originalUrl: '/api/v1/registrations?stationId=abc',
    baseUrl: '/api/v1/registrations',
    ip: '203.0.113.9',
    get: () => undefined,
    auth: undefined,
    route: undefined,
    ...overrides,
  } as never;
}

beforeEach(() => {
  recorded.length = 0;
  resetSecurityAuditWindows();
});

describe('severity grading', () => {
  it('leaves an ordinary capture at INFO', () => {
    expect(severityOf('registration.create')).toBe('INFO');
    expect(outcomeOf('registration.create')).toBe('SUCCESS');
  });

  it('raises corrective actions, which somebody may have to explain', () => {
    expect(severityOf('registration.void')).toBe('NOTICE');
    expect(severityOf('gift.adjust')).toBe('NOTICE');
    expect(severityOf('card.reissue')).toBe('NOTICE');
  });

  it('raises anything that changes who can do what', () => {
    for (const action of ['user.provision', 'user.update', 'user.deactivate'] as const) {
      expect(severityOf(action)).toBe('NOTICE');
    }
  });

  it('treats a replayed refresh token as critical', () => {
    expect(severityOf('session.reuseDetected')).toBe('CRITICAL');
    expect(outcomeOf('session.reuseDetected')).toBe('FAILURE');
  });

  it('marks every refusal DENIED, so one filter finds all of them', () => {
    for (const action of [
      'auth.denied',
      'auth.noRosterRow',
      'rbac.denied',
      'rbac.stationScopeDenied',
      'rateLimit.exceeded',
      'auth.untrustedOrigin',
    ] as const) {
      expect(outcomeOf(action)).toBe('DENIED');
    }
  });
});

describe('the action vocabulary', () => {
  it('has no duplicates', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it('grades every action it lists', () => {
    // severityOf falls back to INFO, so this proves the call never throws and
    // the runtime list and the type union have not drifted apart.
    for (const action of AUDIT_ACTIONS) {
      expect(['INFO', 'NOTICE', 'WARNING', 'CRITICAL']).toContain(severityOf(action));
    }
  });
});

describe('auditRefusal', () => {
  it('ignores statuses that are not security events', () => {
    auditRefusal(request(), 404, 'NOT_FOUND');
    auditRefusal(request(), 409, 'CONFLICT');
    auditRefusal(request(), 400, 'VALIDATION_FAILED');

    expect(recorded).toHaveLength(0);
  });

  it('maps each refusal onto the action that describes it', () => {
    auditRefusal(request({ ip: '1.1.1.1' }), 401, 'UNAUTHENTICATED');
    auditRefusal(request({ ip: '2.2.2.2' }), 403, 'FORBIDDEN');
    auditRefusal(request({ ip: '3.3.3.3' }), 403, 'STATION_SCOPE_DENIED');
    auditRefusal(request({ ip: '4.4.4.4' }), 403, 'ACCOUNT_INACTIVE');
    auditRefusal(request({ ip: '5.5.5.5' }), 429, 'RATE_LIMITED');
    auditRefusal(request({ ip: '6.6.6.6' }), 500, 'INTERNAL_ERROR');

    expect(recorded.map((entry) => entry.action)).toEqual([
      'auth.denied',
      'rbac.denied',
      'rbac.stationScopeDenied',
      'auth.noRosterRow',
      'rateLimit.exceeded',
      'system.error',
    ]);
  });

  it('strips the query string, which can carry a card code or an email', () => {
    auditRefusal(
      request({ originalUrl: '/api/v1/cards/lookup?code=A1B2C3&email=a@b.test' }),
      403,
      'FORBIDDEN',
    );

    expect(recorded[0]?.path).toBe('/api/v1/cards/lookup');
  });

  it('collapses a flood from one caller into a single row', () => {
    for (let i = 0; i < 200; i += 1) {
      auditRefusal(request(), 401, 'UNAUTHENTICATED');
    }

    // The table is the thing that explains an incident; it must not become one.
    expect(recorded).toHaveLength(1);
  });

  it('keeps separate callers separate', () => {
    auditRefusal(request({ ip: '10.0.0.1' }), 401, 'UNAUTHENTICATED');
    auditRefusal(request({ ip: '10.0.0.2' }), 401, 'UNAUTHENTICATED');
    auditRefusal(request({ ip: '10.0.0.1' }), 401, 'UNAUTHENTICATED');

    expect(recorded).toHaveLength(2);
  });

  it('keys an authenticated caller on their subject, not their address', () => {
    const auth = { sub: 'sub-1', volunteerId: 'vol-1', role: 'VOLUNTEER' };

    // Same person, two networks — one window, because the person is the story.
    auditRefusal(request({ auth, ip: '10.0.0.1' }), 403, 'FORBIDDEN');
    auditRefusal(request({ auth, ip: '192.168.1.5' }), 403, 'FORBIDDEN');

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.actorId).toBe('vol-1');
  });

  it('reports what the closed window stood for on the next row', () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i += 1) auditRefusal(request(), 401, 'UNAUTHENTICATED');

      vi.advanceTimersByTime(61_000);
      auditRefusal(request(), 401, 'UNAUTHENTICATED');

      expect(recorded).toHaveLength(2);
      expect(recorded[1]?.after).toMatchObject({ suppressedInPreviousWindow: 4 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not file an untrusted origin twice', () => {
    const req = request();

    // The check records its own CRITICAL row and then throws a plain 403,
    // which the error handler would otherwise file again as rbac.denied.
    auditUntrustedOrigin(req, 'https://evil.example');
    auditRefusal(req, 403, 'FORBIDDEN');

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.action).toBe('auth.untrustedOrigin');
  });
});

describe('the query contract', () => {
  it('defaults to a page, never the table', () => {
    const parsed = AuditQuery.parse({});
    expect(parsed.limit).toBe(50);
  });

  it('refuses a limit past the ceiling', () => {
    expect(AuditQuery.safeParse({ limit: '10000' }).success).toBe(false);
    expect(AuditQuery.safeParse({ limit: '200' }).success).toBe(true);
  });

  it('refuses paging backwards and tailing forwards at once', () => {
    const both = AuditQuery.safeParse({ cursor: 'abc', sinceId: 'def' });

    expect(both.success).toBe(false);
    expect(AuditQuery.safeParse({ sinceId: 'def' }).success).toBe(true);
  });

  it('rejects an unknown filter rather than ignoring it', () => {
    // A typo'd filter that is silently dropped shows the admin a wider set of
    // rows than they asked for, which is the wrong way to fail on this screen.
    expect(AuditQuery.safeParse({ severty: 'WARNING' }).success).toBe(false);
  });
});

describe('CloudWatch configuration', () => {
  /** The minimum a parse needs before the CloudWatch keys matter. */
  const base = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://spoh:spoh@localhost:5435/spoh2027_test',
    AUTH_PROVIDER: 'local',
    LOCAL_AUTH_SECRET: 'test-only-secret-at-least-thirty-two-chars',
  } as NodeJS.ProcessEnv;

  it('treats a key that is present but blank as unset', () => {
    // `.env.example` lists every key with an empty value, so a copied file
    // arrives carrying `CLOUDWATCH_LOG_GROUP=`. That must mean "not
    // configured", not "refuse to start".
    const parsed = parseEnv({
      ...base,
      CLOUDWATCH_LOG_GROUP: '',
      CLOUDWATCH_AUDIT_LOG_GROUP: '   ',
      CLOUDWATCH_REGION: '',
      CLOUDWATCH_RETENTION_DAYS: '',
    });

    expect(parsed.CLOUDWATCH_LOG_GROUP).toBeUndefined();
    expect(parsed.CLOUDWATCH_AUDIT_LOG_GROUP).toBeUndefined();
    expect(parsed.CLOUDWATCH_RETENTION_DAYS).toBeUndefined();
  });

  it('accepts a configured group', () => {
    const parsed = parseEnv({
      ...base,
      CLOUDWATCH_AUDIT_LOG_GROUP: '/spoh2027/audit',
      CLOUDWATCH_RETENTION_DAYS: '365',
    });

    expect(parsed.CLOUDWATCH_AUDIT_LOG_GROUP).toBe('/spoh2027/audit');
    expect(parsed.CLOUDWATCH_RETENTION_DAYS).toBe(365);
  });

  it('refuses a retention period CloudWatch would silently ignore', () => {
    expect(() => parseEnv({ ...base, CLOUDWATCH_RETENTION_DAYS: '42' })).toThrow(
      /retention period/,
    );
  });

  it('refuses to ship app logs with nowhere to ship them', () => {
    expect(() => parseEnv({ ...base, CLOUDWATCH_SHIP_APP_LOGS: 'true' })).toThrow(
      /CLOUDWATCH_LOG_GROUP/,
    );
  });
});
