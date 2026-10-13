import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, type NotificationInput } from '../../src/modules/notification/application/dispatch.js';

const ports = vi.hoisted(() => ({ findActiveVolunteerIds: vi.fn(), findRosteredAt: vi.fn(),
  findSubscriptions: vi.fn(), deleteSubscriptions: vi.fn(), pushEnabled: vi.fn(), sendPush: vi.fn(),
  eventSlug: vi.fn(), eventToday: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../src/modules/notification/data/repo.js', () => ports);
vi.mock('../../src/modules/notification/application/webPush.js', () => ports);
vi.mock('../../src/platform/event/events.js', () => ({ eventSlug: ports.eventSlug }));
vi.mock('../../src/platform/event/today.js', () => ({ eventToday: ports.eventToday }));
vi.mock('../../src/platform/logger/index.js', () => ({ logger: { warn: ports.warn, error: ports.error } }));

const now = new Date('2027-01-07T03:00:00Z');
const today = new Date('2027-01-07T00:00:00Z');
const scope = { eventId: 'owned-event' };
const input: NotificationInput = { kind: 'incident.critical', priority: 'URGENT', title: 'Safety alert',
  body: 'Open the incident.', url: '/incidents', tag: 'incident:synthetic',
  audience: { everyone: false, volunteerIds: ['person'] } };
const device = (id: string) => ({ id, endpoint: `https://push.example.test/${id}`,
  p256dh: 'synthetic-public-key', auth: 'synthetic-auth-key' });

beforeEach(() => {
  vi.resetAllMocks(); ports.pushEnabled.mockReturnValue(true);
  ports.findActiveVolunteerIds.mockResolvedValue(['person', 'senior']);
  ports.findRosteredAt.mockResolvedValue(['person', 'station-person']);
  ports.findSubscriptions.mockResolvedValue([device('device')]);
  ports.eventToday.mockResolvedValue(today); ports.eventSlug.mockResolvedValue('own event');
  ports.sendPush.mockResolvedValue(undefined); ports.deleteSubscriptions.mockResolvedValue(2);
});

describe('legacy notification fan-out compatibility', () => {
  it('unions scoped active, senior, today-station and named audiences, then deduplicates and excludes the author', async () => {
    const result = await dispatch(scope, { ...input, excludeVolunteerId: 'person', audience: {
      everyone: true, minimumRole: 'DEPUTY_COORDINATOR', stationId: 'station', volunteerIds: ['person', 'named'],
    } }, now);
    expect(result).toMatchObject({ recipients: 3, devices: 1, delivered: 1, failed: 0, pruned: 0 });
    expect(ports.findActiveVolunteerIds).toHaveBeenCalledWith(scope, ['ADMIN', 'LEAD', 'CHIEF_COORDINATOR', 'DEPUTY_COORDINATOR']);
    expect(ports.eventToday).toHaveBeenCalledExactlyOnceWith(scope, now);
    expect(ports.findRosteredAt).toHaveBeenCalledExactlyOnceWith(scope, { stationId: 'station', day: today });
    expect(ports.findSubscriptions).toHaveBeenCalledExactlyOnceWith(['named', 'senior', 'station-person']);
    expect(ports.sendPush).toHaveBeenCalledExactlyOnceWith({ endpoint: device('device').endpoint,
      keys: { p256dh: 'synthetic-public-key', auth: 'synthetic-auth-key' } },
    JSON.stringify({ title: input.title, body: input.body, url: '/e/own%20event/incidents',
      tag: input.tag, kind: input.kind, priority: input.priority }), { ttlSeconds: 900, urgent: true });
  });

  it('looks up every active role only for an everyone audience', async () => {
    await dispatch(scope, { ...input, audience: { everyone: true, volunteerIds: [] } }, now);
    expect(ports.findActiveVolunteerIds).toHaveBeenCalledExactlyOnceWith(scope, undefined);
    expect(ports.eventToday).not.toHaveBeenCalled(); expect(ports.findRosteredAt).not.toHaveBeenCalled();
  });

  it('keeps polling usable when push is deliberately disabled', async () => {
    ports.pushEnabled.mockReturnValue(false);
    expect(await dispatch(scope, input, now)).toEqual({ kind: input.kind, priority: input.priority,
      recipients: 1, devices: 0, delivered: 0, failed: 0, pruned: 0, enabled: false });
    expect(ports.findSubscriptions).not.toHaveBeenCalled(); expect(ports.sendPush).not.toHaveBeenCalled();
    expect(ports.warn).toHaveBeenCalledExactlyOnceWith(
      { kind: input.kind, recipients: 1 }, 'notification dispatch attempted',
    );
  });

  it('makes no device query after the only recipient was excluded', async () => {
    const result = await dispatch(scope, { ...input, excludeVolunteerId: 'person' }, now);
    expect(result.recipients).toBe(0); expect(ports.findSubscriptions).not.toHaveBeenCalled();
    expect(ports.sendPush).not.toHaveBeenCalled();
  });

  it('does not resolve an event link when no device exists', async () => {
    ports.findSubscriptions.mockResolvedValue([]);
    expect(await dispatch(scope, input)).toMatchObject({ recipients: 1, devices: 0, delivered: 0 });
    expect(ports.eventSlug).not.toHaveBeenCalled(); expect(ports.sendPush).not.toHaveBeenCalled();
  });

  it('reports partial fan-out, prunes only permanent gone statuses and preserves transient devices', async () => {
    ports.findSubscriptions.mockResolvedValue(['accepted', 'gone404', 'gone410', 'transient'].map(device));
    ports.sendPush.mockImplementation(async (target: { endpoint: string }) => {
      if (target.endpoint.endsWith('/gone404')) throw { statusCode: 404 };
      if (target.endpoint.endsWith('/gone410')) throw { statusCode: 410 };
      if (target.endpoint.endsWith('/transient')) throw new Error('synthetic provider timeout');
    });
    expect(await dispatch(scope, { ...input, kind: 'assignment.changed', priority: 'OPERATIONAL' }, now))
      .toMatchObject({ devices: 4, delivered: 1, failed: 3, pruned: 2 });
    expect(ports.deleteSubscriptions).toHaveBeenCalledExactlyOnceWith(['gone404', 'gone410']);
    expect(ports.sendPush.mock.calls.every(([, , options]) => options.ttlSeconds === 1800 && options.urgent === false)).toBe(true);
    expect(JSON.stringify(ports.warn.mock.calls)).not.toMatch(/synthetic-public-key|synthetic-auth-key|https:\/\/push/);
  });

  it('never prunes a retryable failure and never rejects its triggering record', async () => {
    ports.sendPush.mockRejectedValue({ statusCode: 503 });
    await expect(dispatch(scope, input, now)).resolves.toMatchObject({ delivered: 0, failed: 1, pruned: 0 });
    expect(ports.deleteSubscriptions).not.toHaveBeenCalled();
  });

  it('retains delivered/failed evidence when permanent-device pruning itself is unavailable', async () => {
    ports.sendPush.mockRejectedValue({ statusCode: 410 });
    ports.deleteSubscriptions.mockRejectedValue(new Error('synthetic cleanup outage'));
    await expect(dispatch(scope, input, now)).resolves.toMatchObject({ recipients: 1, devices: 1, delivered: 0, failed: 1, pruned: 0 });
    expect(ports.error).toHaveBeenCalledOnce();
  });

  it('does not leak an audience-resolution failure back into the source mutation', async () => {
    ports.findActiveVolunteerIds.mockRejectedValue(new Error('synthetic membership outage'));
    await expect(dispatch(scope, { ...input, audience: { everyone: true, volunteerIds: [] } }, now))
      .resolves.toMatchObject({ recipients: 0, devices: 0, delivered: 0, failed: 0 });
    expect(ports.sendPush).not.toHaveBeenCalled(); expect(ports.error).toHaveBeenCalledOnce();
  });
});
