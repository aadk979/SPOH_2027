import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { announcementTarget, grantedRank, settingCheck } from './authorizeResources.js';

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
