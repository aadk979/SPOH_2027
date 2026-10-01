import { beforeEach, describe, expect, it } from 'vitest';
import { changeSetting, resetSetting, revertSetting } from '../../src/platform/settings/change.js';
import { loadResolvedSetting } from '../../src/platform/settings/scopedStore.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createStation, testEvent } from '../helpers/fixtures.js';

const audit = {
  actorId: null,
  actorSub: null,
  eventId: null,
  membershipId: null,
  ip: null,
  userAgent: null,
  requestId: 'setting-store-test',
};

beforeEach(resetDatabase);

describe('scoped setting store (P10.2)', () => {
  it('resolves each permitted layer and isolates two events', async () => {
    const { eventId } = await testEvent();
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    const station = await createStation({ code: 'ENTRY' });
    const other = await rawDb.event.create({
      data: {
        organisationId: event.organisationId,
        slug: 'other-settings-event',
        name: 'Other settings event',
        timezone: event.timezone,
      },
    });
    const context = { organisationId: event.organisationId, eventId, stationId: station.id };
    expect(await loadResolvedSetting('silentStationMinutes', context)).toMatchObject({
      value: 15,
      source: 'default',
    });
    await changeSetting({
      target: { scope: 'platform', organisationId: event.organisationId },
      key: 'silentStationMinutes',
      value: 30,
      expectedVersion: 0,
      actorPersonId: null,
      audit,
    });
    expect(await loadResolvedSetting('silentStationMinutes', context)).toMatchObject({
      value: 30,
      source: 'platform',
    });
    await changeSetting({
      target: { scope: 'event', eventId },
      key: 'silentStationMinutes',
      value: 20,
      expectedVersion: 0,
      actorPersonId: null,
      audit,
    });
    expect(await loadResolvedSetting('silentStationMinutes', context)).toMatchObject({
      value: 20,
      source: 'event',
    });
    await changeSetting({
      target: { scope: 'station', eventId, stationId: station.id },
      key: 'silentStationMinutes',
      value: 10,
      expectedVersion: 0,
      actorPersonId: null,
      audit,
    });
    expect(await loadResolvedSetting('silentStationMinutes', context)).toMatchObject({
      value: 10,
      source: 'station',
    });
    expect(
      await loadResolvedSetting('silentStationMinutes', {
        organisationId: event.organisationId,
        eventId: other.id,
      }),
    ).toMatchObject({ value: 30, source: 'platform' });
  });

  it('writes an audited history, rejects stale edits and reverts as a new version', async () => {
    const { eventId } = await testEvent();
    const target = { scope: 'event' as const, eventId };
    const input = { target, key: 'silentStationMinutes' as const, actorPersonId: null, audit };
    expect(
      await changeSetting({ ...input, value: 20, expectedVersion: 0, reason: 'rehearsal' }),
    ).toBe(1);
    expect(await changeSetting({ ...input, value: 25, expectedVersion: 1 })).toBe(2);
    await expect(changeSetting({ ...input, value: 40, expectedVersion: 1 })).rejects.toMatchObject({
      code: 'SETTING_VERSION_CONFLICT',
    });
    expect(await revertSetting({ ...input, expectedVersion: 2, toVersion: 1 })).toBe(3);
    const history = await rawDb.settingChange.findMany({
      where: { eventId, key: input.key },
      orderBy: { version: 'asc' },
    });
    expect(history.map(({ version, after, source }) => ({ version, after, source }))).toEqual([
      { version: 1, after: 20, source: 'USER' },
      { version: 2, after: 25, source: 'USER' },
      { version: 3, after: 20, source: 'REVERT' },
    ]);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'setting.change' } })).toBe(3);
  });

  it('resets to inheritance, retains monotonic history, and skips corrupt rows', async () => {
    const { eventId } = await testEvent();
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    const context = { organisationId: event.organisationId, eventId };
    const input = {
      target: { scope: 'event' as const, eventId },
      key: 'silentStationMinutes' as const,
      actorPersonId: null,
      audit,
    };
    await changeSetting({ ...input, value: 22, expectedVersion: 0 });
    expect(await resetSetting({ ...input, expectedVersion: 1 })).toBe(2);
    expect(await loadResolvedSetting(input.key, context)).toMatchObject({
      source: 'default',
      value: 15,
      version: 0,
    });
    expect(await changeSetting({ ...input, value: 18, expectedVersion: 0 })).toBe(3);
    await rawDb.setting.updateMany({ where: { eventId, key: input.key }, data: { value: 0 } });
    expect(await loadResolvedSetting(input.key, context)).toMatchObject({
      source: 'default',
      value: 15,
      invalidScopes: ['event'],
    });
    expect(
      (
        await rawDb.settingChange.findMany({
          where: { eventId, key: input.key },
          orderBy: { version: 'asc' },
        })
      ).map(({ version, source }) => ({ version, source })),
    ).toEqual([
      { version: 1, source: 'USER' },
      { version: 2, source: 'RESET' },
      { version: 3, source: 'USER' },
    ]);
  });

  it('can revert a nullable setting without exposing its value in audit', async () => {
    const { eventId } = await testEvent();
    const input = {
      target: { scope: 'event' as const, eventId },
      key: 'attendance.rootMembershipId' as const,
      actorPersonId: null,
      audit,
    };
    await changeSetting({ ...input, value: null, expectedVersion: 0 });
    await changeSetting({ ...input, value: 'member-id', expectedVersion: 1 });
    expect(await revertSetting({ ...input, expectedVersion: 2, toVersion: 1 })).toBe(3);
    const auditRow = await rawDb.auditLog.findFirstOrThrow({
      where: { eventId, action: 'setting.change' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(auditRow.after)).not.toContain('member-id');
    expect(
      (await rawDb.setting.findFirstOrThrow({ where: { eventId, key: input.key } })).value,
    ).toBeNull();
  });

  it('can revert to a previous reset version', async () => {
    const { eventId } = await testEvent();
    const input = {
      target: { scope: 'event' as const, eventId },
      key: 'silentStationMinutes' as const,
      actorPersonId: null,
      audit,
    };
    await changeSetting({ ...input, value: 20, expectedVersion: 0 });
    await resetSetting({ ...input, expectedVersion: 1 });
    await changeSetting({ ...input, value: 30, expectedVersion: 0 });
    expect(await revertSetting({ ...input, expectedVersion: 3, toVersion: 2 })).toBe(4);
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(
      await loadResolvedSetting(input.key, {
        organisationId: event.organisationId,
        eventId,
      }),
    ).toMatchObject({ source: 'default', value: 15 });
  });

  it('does not allow a station setting to name a station from another event', async () => {
    const { eventId } = await testEvent();
    await expect(
      changeSetting({
        target: { scope: 'station', eventId, stationId: 'another-event-station' },
        key: 'silentStationMinutes',
        value: 10,
        expectedVersion: 0,
        actorPersonId: null,
        audit,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a mismatched organisation and event during resolution', async () => {
    const { eventId } = await testEvent();
    const other = await rawDb.organisation.upsert({
      where: { slug: 'other-settings-resolution-org' },
      create: {
        slug: 'other-settings-resolution-org',
        name: 'Other',
        appName: 'Other',
        defaultTimezone: 'Asia/Singapore',
      },
      update: {},
    });
    await expect(
      loadResolvedSetting('silentStationMinutes', {
        organisationId: other.id,
        eventId,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rolls back the setting and history if its audit write fails', async () => {
    const { eventId } = await testEvent();
    await expect(
      changeSetting({
        target: { scope: 'event', eventId },
        key: 'silentStationMinutes',
        value: 20,
        expectedVersion: 0,
        actorPersonId: null,
        audit: { ...audit, actorId: 'missing-person' },
      }),
    ).rejects.toThrow();
    expect(await rawDb.setting.count({ where: { eventId, key: 'silentStationMinutes' } })).toBe(0);
    expect(
      await rawDb.settingChange.count({ where: { eventId, key: 'silentStationMinutes' } }),
    ).toBe(0);
  });
});
