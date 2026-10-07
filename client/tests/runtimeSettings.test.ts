import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The device settings cache belongs to one signed-in volunteer working in one
 * event (P10.2). The modules hold state, so each test loads fresh copies, and
 * `fetch` is stubbed to play the server.
 */

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function session(id: string) {
  return {
    accessToken: `token-${id}`,
    tokenType: 'Bearer',
    expiresIn: 900,
    volunteer: { id, displayName: id, role: 'VOLUNTEER' },
    capabilities: ['own.read'],
    refreshAvailable: false,
  };
}

const settings = (captureUndoWindowSeconds: number) => ({
  settings: {
    dashboardPollSeconds: 3,
    alertPollSeconds: 10,
    captureUndoWindowSeconds,
    captureSendGraceSeconds: 2,
    outboxWarningCount: 20,
    outboxWarningAgeMinutes: 5,
  },
});

type Pending = { url: string; token: string | null; answer: (response: Response) => void };
let pending: Pending[];
let signInAs: string;

beforeEach(() => {
  vi.resetModules();
  pending = [];
  signInAs = 'v1';
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/session') && init?.method === 'POST')
        return Promise.resolve(json(201, session(signInAs)));
      if (url.endsWith('/auth/session'))
        return Promise.resolve(new Response(null, { status: 204 }));
      if (url.endsWith('/auth/refresh')) return Promise.resolve(json(401, {}));
      if (url.includes('/admin/settings/client')) {
        const headers = new Headers(init?.headers);
        return new Promise<Response>((answer) => {
          pending.push({ url, token: headers.get('Authorization'), answer });
        });
      }
      return Promise.resolve(json(404, {}));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  const session = await import('@/shared/lib/session');
  const runtime = await import('@/shared/lib/runtimeSettings');
  runtime.loadClientSettings();
  return { ...session, ...runtime };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function answer(index: number, response: Response): Promise<void> {
  pending[index]!.answer(response);
  await settle();
  await settle();
}

describe('device settings ownership', () => {
  it('asks nothing until both a person and an event page are known', async () => {
    const { openSession, selectClientSettingsEvent } = await load();
    await settle();
    expect(pending).toHaveLength(0);
    await openSession({ email: 'v1@spoh.test' });
    await settle();
    expect(pending).toHaveLength(0);
    selectClientSettingsEvent('evt-a');
    await settle();
    expect(pending.map((call) => [call.url.replace(/^.*\/api\/v1/, ''), call.token])).toEqual([
      ['/events/evt-a/admin/settings/client', 'Bearer token-v1'],
    ]);
  });

  it('uses the open event’s answer and fetches once for it', async () => {
    const { openSession, selectClientSettingsEvent, getClientSettings, ms } = await load();
    await openSession({ email: 'v1@spoh.test' });
    selectClientSettingsEvent('evt-a');
    await settle();
    await answer(0, json(200, settings(25)));
    expect(getClientSettings().captureUndoWindowSeconds).toBe(25);
    expect(ms.undoWindow()).toBe(25_000);
    selectClientSettingsEvent('evt-a');
    await settle();
    expect(pending).toHaveLength(1);
  });

  it('drops one event’s values at once when another event opens', async () => {
    const { openSession, selectClientSettingsEvent, getClientSettings } = await load();
    await openSession({ email: 'v1@spoh.test' });
    selectClientSettingsEvent('evt-a');
    await settle();
    await answer(0, json(200, settings(25)));
    selectClientSettingsEvent('evt-b');
    expect(getClientSettings().captureUndoWindowSeconds).toBe(10);
    await settle();
    expect(pending[1]!.url).toContain('/events/evt-b/admin/settings/client');
    await answer(1, json(200, settings(30)));
    expect(getClientSettings().captureUndoWindowSeconds).toBe(30);
  });

  it('discards a late answer for an event that is no longer open', async () => {
    const { openSession, selectClientSettingsEvent, getClientSettings } = await load();
    await openSession({ email: 'v1@spoh.test' });
    selectClientSettingsEvent('evt-a');
    await settle();
    selectClientSettingsEvent('evt-b');
    await settle();
    await answer(1, json(200, settings(30)));
    await answer(0, json(200, settings(25)));
    expect(getClientSettings().captureUndoWindowSeconds).toBe(30);
  });

  it('never hands one person’s values to the next, even when the answer is late', async () => {
    const { openSession, signOut, selectClientSettingsEvent, getClientSettings } = await load();
    await openSession({ email: 'v1@spoh.test' });
    selectClientSettingsEvent('evt-a');
    await settle();
    await signOut();
    expect(getClientSettings().captureUndoWindowSeconds).toBe(10);
    signInAs = 'v2';
    await openSession({ email: 'v2@spoh.test' });
    await settle();
    expect(pending[1]!.token).toBe('Bearer token-v2');
    await answer(0, json(200, settings(25)));
    expect(getClientSettings().captureUndoWindowSeconds).toBe(10);
    await answer(1, json(200, settings(40)));
    expect(getClientSettings().captureUndoWindowSeconds).toBe(40);
  });

  it('clears on sign-out and keeps the defaults after a failed or malformed answer', async () => {
    const { openSession, signOut, selectClientSettingsEvent, getClientSettings } = await load();
    await openSession({ email: 'v1@spoh.test' });
    selectClientSettingsEvent('evt-a');
    await settle();
    await answer(0, json(200, { settings: { captureUndoWindowSeconds: 25 } }));
    expect(getClientSettings().captureUndoWindowSeconds).toBe(10);
    selectClientSettingsEvent('evt-b');
    await settle();
    await answer(1, json(200, settings(30)));
    expect(getClientSettings().captureUndoWindowSeconds).toBe(30);
    await signOut();
    expect(getClientSettings().captureUndoWindowSeconds).toBe(10);
  });
});
