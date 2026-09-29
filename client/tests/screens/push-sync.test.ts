import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPush } from '@/features/notification/api';
import { syncPushSubscription } from '@/features/notification/pushSync';

vi.mock('@/features/notification/api', () => ({ registerPush: vi.fn() }));
const mockedRegister = vi.mocked(registerPush);

function browserWith(endpoint: string | null, permission = 'granted') {
  const subscription = endpoint
    ? {
        endpoint,
        toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
      }
    : null;
  vi.stubGlobal('Notification', { permission });
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager: { getSubscription: async () => subscription } }),
    },
  });
}

beforeEach(() => {
  mockedRegister.mockReset();
  mockedRegister.mockResolvedValue({});
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('push subscription sync (F03-035)', () => {
  it('registers a subscription the server has not been given for this volunteer', async () => {
    browserWith('https://push.example/new');
    await syncPushSubscription('v1');
    expect(mockedRegister).toHaveBeenCalledWith({
      endpoint: 'https://push.example/new',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('does not re-register the same subscription for the same volunteer', async () => {
    browserWith('https://push.example/same');
    await syncPushSubscription('v1');
    await syncPushSubscription('v1');
    expect(mockedRegister).toHaveBeenCalledTimes(1);
  });

  it('re-registers when another volunteer signs in on the phone, or the browser rotates it', async () => {
    browserWith('https://push.example/one');
    await syncPushSubscription('v1');
    await syncPushSubscription('v2');
    browserWith('https://push.example/rotated');
    await syncPushSubscription('v2');
    expect(mockedRegister.mock.calls.map(([body]) => body.endpoint)).toEqual([
      'https://push.example/one',
      'https://push.example/one',
      'https://push.example/rotated',
    ]);
  });

  it('does nothing without permission or a subscription', async () => {
    browserWith('https://push.example/x', 'default');
    await syncPushSubscription('v1');
    browserWith(null);
    await syncPushSubscription('v1');
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('tries again next time when the server could not be told', async () => {
    browserWith('https://push.example/retry');
    mockedRegister.mockRejectedValueOnce(new Error('offline'));
    await syncPushSubscription('v1');
    await syncPushSubscription('v1');
    expect(mockedRegister).toHaveBeenCalledTimes(2);
  });
});
