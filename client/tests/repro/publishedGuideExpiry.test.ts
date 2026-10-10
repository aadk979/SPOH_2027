import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, NetworkError } from '@/shared/lib/api';
import { clearSession, getAccessToken, setSession } from '@/shared/lib/session';
import { getContentImage, getPublishedContent } from '@/features/content/api';
import { PUBLISHED_GUIDE } from '../helpers/content';
import { TEST_EVENT } from '../helpers/event';

vi.mock('@/shared/lib/env', () => ({
  loadClientConfiguration: async () => ({ apiBaseUrl: 'https://api.example.test' }),
  ClientConfigurationError: class extends Error {},
}));

function publishedWorker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const stored = new Map<string, Response>();
  const cache = {
    put: async (url: string, response: Response) => { stored.set(url, response); },
    match: async (url: string) => stored.get(url)?.clone(),
  };
  const imagePath = `/events/${TEST_EVENT.id}/content/assets/${PUBLISHED_GUIDE.id}/map-0`;
  const record = { ...PUBLISHED_GUIDE, images: { photo: imagePath } };
  const network = vi.fn(async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const headers = { 'cache-control': url.search ? 'private, max-age=31536000, immutable' : 'no-store' };
    if (url.pathname.endsWith('/map-0')) {
      return new Response('floor plan bytes', { headers: { 'cache-control': 'private, max-age=31536000, immutable' } });
    }
    return Response.json({ data: record }, { headers });
  });
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: {
      location: { origin: 'https://client.example.test', search: '?v=expiry-test' },
      addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler),
    },
    caches: { open: async () => cache }, fetch: network, URL, URLSearchParams,
  });
  const browserFetch = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    let intercepted: Promise<Response> | undefined;
    handlers.get('fetch')!({
      request,
      respondWith: (response: Promise<Response>) => { intercepted = response; },
    });
    return intercepted ?? network(request);
  });
  return { browserFetch, network, stored, imagePath, record };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  setSession({
    accessToken: 'thin-proof', volunteerId: 'person_a', displayName: 'Sample', role: 'VOLUNTEER',
    expiresAt: Date.now() + 120_000, refreshAvailable: false,
  });
});
afterEach(() => {
  clearSession();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('reads cached published bytes after access expires and the API becomes unreachable on connected Wi-Fi', async () => {
  const worker = publishedWorker();
  vi.stubGlobal('fetch', worker.browserFetch);
  expect((await getPublishedContent(TEST_EVENT.id, 'person_a')).record).toEqual(worker.record);
  expect(worker.stored.size).toBe(2);
  await vi.advanceTimersByTimeAsync(120_001);
  expect(getAccessToken()).toBeNull();
  expect(navigator.onLine).toBe(true);
  worker.network.mockRejectedValue(new TypeError('API unreachable'));
  const saved = await getPublishedContent(TEST_EVENT.id, 'person_a');
  expect(saved).toEqual({ record: worker.record, offline: true });
  expect(await (await getContentImage(worker.imagePath)).text()).toBe('floor plan bytes');
  await expect(api(`/events/${TEST_EVENT.id}/content/draft`)).rejects.toBeInstanceOf(NetworkError);
  expect([...worker.stored.keys()].every((url) => !url.includes('thin-proof'))).toBe(true);
  clearSession();
  await expect(getPublishedContent(TEST_EVENT.id, 'person_a')).rejects.toBeInstanceOf(NetworkError);
});
