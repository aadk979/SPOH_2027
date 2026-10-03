import { beforeEach, expect, it, vi } from 'vitest';
import {
  sendDevicePush,
  type DevicePushInput,
} from '../../src/modules/notification/application/sendDevicePush.js';
import { pushEnabled, sendPush } from '../../src/modules/notification/application/webPush.js';

vi.mock('../../src/modules/notification/application/webPush.js', () => ({
  pushEnabled: vi.fn(),
  sendPush: vi.fn(),
}));
const input: DevicePushInput = {
  target: {
    endpoint: 'https://push.test/unit',
    keys: { p256dh: 'fixture-key', auth: 'fixture-auth' },
  },
  payload: {
    title: 'Urgent announcement',
    body: 'Operational preview',
    url: '/e/test-event/inbox',
    tag: 'announcement:fixture',
    kind: 'announcement.urgent',
    priority: 'URGENT',
  },
  ttlSeconds: 25,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(pushEnabled).mockReturnValue(true);
});

it('supports unconfigured push without a network attempt', async () => {
  vi.mocked(pushEnabled).mockReturnValue(false);
  expect(await sendDevicePush(input)).toBe('UNCONFIGURED');
  expect(sendPush).not.toHaveBeenCalled();
});
it('reports service acceptance with the bounded caller TTL and urgency', async () => {
  vi.mocked(sendPush).mockResolvedValue();
  expect(await sendDevicePush(input)).toBe('ACCEPTED');
  expect(sendPush).toHaveBeenCalledWith(input.target, JSON.stringify(input.payload), {
    ttlSeconds: 25,
    urgent: true,
  });
});
it.each([404, 410, 500, undefined])(
  'bounds a status %s failure without exposing raw exceptions',
  async (statusCode) => {
    vi.mocked(sendPush).mockRejectedValue({ statusCode, body: 'private provider data' });
    expect(await sendDevicePush(input)).toBe(
      statusCode === 404 || statusCode === 410 ? 'GONE' : 'FAILED',
    );
  },
);
