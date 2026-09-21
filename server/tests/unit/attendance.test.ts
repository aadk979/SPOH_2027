import { describe, expect, it, vi } from 'vitest';
import { isCampusIp, parseCidr } from '../../src/lib/campusNetwork.js';

vi.mock('../../src/config/env.js', () => ({
  env: { ATTENDANCE_SIGNING_SECRET: 'attendance-test-secret-at-least-32-characters' },
}));
import {
  hashPin,
  signAttendanceToken,
  verifyAttendanceToken,
} from '../../src/modules/attendance/tokens.js';

describe('campus network ranges', () => {
  it('matches approved IPv4 subnets, including mapped IPv6 peers, without trusting nearby addresses', () => {
    expect(isCampusIp('203.0.113.4', ['203.0.113.0/24'])).toBe(true);
    expect(isCampusIp('::ffff:203.0.113.254', ['203.0.113.0/24'])).toBe(true);
    expect(isCampusIp('203.0.112.4', ['203.0.113.0/24'])).toBe(false);
    expect(isCampusIp('198.51.100.5', ['203.0.113.0/24', '198.51.100.0/24'])).toBe(true);
  });
  it('supports IPv6 campus egress and fails closed for missing configuration or invalid addresses', () => {
    expect(isCampusIp('2001:db8:abcd::1234', ['2001:db8:abcd::/48'])).toBe(true);
    expect(isCampusIp('2001:db8:abce::1', ['2001:db8:abcd::/48'])).toBe(false);
    expect(isCampusIp('127.0.0.1', [])).toBe(false);
    expect(isCampusIp(null, ['127.0.0.1/32'])).toBe(false);
    expect(isCampusIp('203.0.113.4, 127.0.0.1', ['127.0.0.1/32'])).toBe(false);
  });
  it.each(['bad', '1.2.3.4/33', '::1/129', '1.2.3.4/-1', '1.2.3.4/', '1.2.3.4/24/1'])(
    'rejects malformed CIDR %s',
    (value) => {
      expect(() => parseCidr(value)).toThrow();
    },
  );
});

describe('attendance tokens', () => {
  const now = new Date('2027-01-07T03:30:00Z');
  it('binds issuer, event day and challenge, and expires at exactly five minutes', async () => {
    const token = await signAttendanceToken('challenge', 'root', 'day', now);
    expect(await verifyAttendanceToken(token, new Date(now.getTime() + 299_000))).toEqual({
      id: 'challenge',
      issuerId: 'root',
      eventDayId: 'day',
    });
    await expect(verifyAttendanceToken(token, new Date(now.getTime() + 300_000))).rejects.toThrow(
      /expired/,
    );
  });
  it('rejects forged claims, malformed tokens and future issuance', async () => {
    const token = await signAttendanceToken('challenge', 'root', 'day', now);
    const [header, , signature] = token.split('.');
    const forged = `${header}.${Buffer.from(JSON.stringify({ sub: 'another-root', eventDayId: 'day' })).toString('base64url')}.${signature}`;
    await expect(verifyAttendanceToken(forged, now)).rejects.toThrow();
    await expect(verifyAttendanceToken('not-a-token', now)).rejects.toThrow();
    await expect(verifyAttendanceToken(token, new Date(now.getTime() - 10_000))).rejects.toThrow();
  });
  it('stores deterministic keyed PIN hashes rather than plaintext PINs', () => {
    expect(hashPin('0000000001')).toHaveLength(64);
    expect(hashPin('0000000001')).toBe(hashPin('0000000001'));
    expect(hashPin('0000000001')).not.toBe(hashPin('0000000002'));
  });
});
