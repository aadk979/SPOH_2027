import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPush } from '@/features/notification/api';
import { syncPushSubscription } from '@/features/notification/pushSync';
import { clearSession, setSession } from '@/shared/lib/session';

vi.mock('@/features/notification/api', () => ({ registerPush: vi.fn() }));
const mockedRegister = vi.mocked(registerPush);
function signIn(volunteerId: string) {
  setSession({ accessToken: 'synthetic-push-session', volunteerId, displayName: volunteerId, role: 'VOLUNTEER',
    expiresAt: Date.now() + 60_000, refreshAvailable: false });
}

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
  signIn('v1');
});
afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

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
    signIn('v2');
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
  it('does not give a late subscription to a different signed-in person', async () => {
    browserWith('https://push.example/old-owner');
    let finish: () => void = () => undefined;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: new Promise((resolve) => {
      finish = () => resolve({ pushManager: { getSubscription: async () => ({ endpoint: 'https://push.example/old-owner',
        toJSON: () => ({ endpoint: 'https://push.example/old-owner', keys: { p256dh: 'p', auth: 'a' } }) }) } });
    }) } });
    const pending = syncPushSubscription('v1');
    signIn('v2');
    finish();
    await pending;
    expect(mockedRegister).not.toHaveBeenCalled();
    expect(localStorage.getItem('spoh.push.registered')).toBeNull();
  });
});
