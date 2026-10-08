import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { compare, type ShadowOutcome } from './authorize.js';
import { announcementTarget, grantedRank, settingCheck } from './authorizeResources.js';

const at = (status: number, legacyGuardRefused = false) => ({ status, legacyGuardRefused });

const decided = (allowed: boolean): ShadowOutcome => ({
  kind: 'decided',
  allowed,
  checks: [{ action: 'Structure.Read', allowed, policies: [], errors: [] }],
});

describe('a shadow decision against what the app answered', () => {
  it('agrees when both allow or both refuse', () => {
    expect(compare(decided(true), at(200), {})).toBeNull();
    expect(compare(decided(false), at(403), {})).toBeNull();
  });

  it('reports a request the policies would refuse but the app served', () => {
    expect(compare(decided(false), at(201), {})).toMatchObject({
      message: 'authorization shadow mismatch',
      detail: { cedar: 'deny', status: 201, explainedBy: 'unexplained' },
    });
  });

  it('reports a request the policies would allow but the app refused, with its change', () => {
    expect(compare(decided(true), at(403, true), { changes: ['C7'] })).toMatchObject({
      detail: { cedar: 'allow', refusedBy: 'guard', explainedBy: ['C7'] },
    });
    expect(compare(decided(true), at(403), {})).toMatchObject({
      detail: { refusedBy: 'use case' },
    });
  });

  it('does not compare an answer that says nothing about permission', () => {
    for (const status of [400, 404, 409, 422, 429, 500]) {
      expect(compare(decided(false), at(status), {})).toBeNull();
      expect(compare(decided(true), at(status), {})).toBeNull();
    }
  });

  it('reports an evaluation error unless the route refused the request as well', () => {
    const failed: ShadowOutcome = { kind: 'failed', error: 'NotFoundError: Station not found' };
    expect(compare(failed, at(404), {})).toBeNull();
    expect(compare(failed, at(400), {})).toBeNull();
    expect(compare(failed, at(403), {})).toBeNull();
    expect(compare(failed, at(200), {})).toMatchObject({ message: 'authorization shadow error' });
  });

  it('has nothing to compare when there was nothing to ask', () => {
    expect(compare({ kind: 'unaskable' }, at(200), {})).toBeNull();
  });
});

const request = (body: unknown): Request =>
  ({ body, auth: { eventId: 'E1' } }) as unknown as Request;

describe('the questions a request asks', () => {
  it('changes a setting with the action of its class (C9)', () => {
    expect(settingCheck('lostPersonPurgeHours')).toMatchObject({
      action: 'Settings.ManagePrivacy',
    });
    expect(settingCheck('attendance.campusCidrs')).toMatchObject({
      action: 'Settings.ManageSecurity',
    });
    expect(settingCheck('attendance.campusNetworkLabel')).toMatchObject({
      action: 'Settings.ManageEvent',
      resource: { type: 'Setting', id: 'attendance.campusNetworkLabel' },
    });
    expect(() => settingCheck('no.such.key')).toThrow(/Unknown setting/);
  });

  it('sends to a station as a station send, and with no station to the whole event', () => {
    expect(announcementTarget(request({ target: { stationId: 'S1' } }))).toEqual([
      { action: 'Announcement.SendStation', resource: { type: 'Station', id: 'S1' } },
    ]);
    expect(announcementTarget(request({ target: { stationId: null } }))).toEqual([
      { action: 'Announcement.SendEvent', resource: { type: 'Event', id: 'E1' } },
    ]);
    expect(announcementTarget(request({}))).toEqual([
      { action: 'Announcement.SendEvent', resource: { type: 'Event', id: 'E1' } },
    ]);
  });

  it('reads the rank of the role a body grants', () => {
    expect(grantedRank(request({ role: 'IC' }))).toBe(20);
    expect(grantedRank(request({}), 'VOLUNTEER')).toBe(10);
    expect(grantedRank(request({ role: 'OWNER' }))).toBeUndefined();
    expect(grantedRank(request({}))).toBeUndefined();
  });
});
