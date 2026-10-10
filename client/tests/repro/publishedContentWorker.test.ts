import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const stored = new Map<string, Response>();
  const cache = {
    put: vi.fn(async (url: string, response: Response) => {
      stored.set(url, response);
    }),
    match: vi.fn(async (url: string) => stored.get(url)?.clone()),
  };
  const fetch = vi
    .fn()
    .mockImplementation(async () =>
      new Response('published', {
        headers: { 'cache-control': 'private, max-age=31536000, immutable' },
      }),
    );
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: {
      location: { origin: 'https://client.example', search: '?v=42' },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler),
    },
    caches: { open: vi.fn(async () => cache) },
    fetch,
    URL,
    URLSearchParams,
  });
  async function get(path: string, token = 'Bearer synthetic') {
    let result: Promise<Response> | undefined;
    handlers.get('fetch')!({
      request: {
        method: 'GET',
        url: `https://api.example/api/v1/events/event_a/${path}`,
        headers: new Headers(token ? { Authorization: token } : {}),
      },
      respondWith: (response: Promise<Response>) => {
        result = response;
      },
    });
    return result;
  }
  return { get, fetch, cache, stored };
}
describe('published content service worker cache', () => {
  it('caches immutable versioned guide and floor-plan URLs without retaining credentials', async () => {
    const sw = worker();
    expect(await (await sw.get('content?v=version_a'))!.text()).toBe('published');
    await sw.get('content/assets/version_a/map-0');
    expect(sw.cache.put.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example/api/v1/events/event_a/content?v=version_a',
      'https://api.example/api/v1/events/event_a/content/assets/version_a/map-0',
    ]);
    sw.fetch.mockRejectedValue(new TypeError('offline'));
    expect(await (await sw.get('content?v=version_a'))!.text()).toBe('published');
  });
  it.each([
    'content',
    'content/draft',
    'content?v=version_a&extra=1',
    'registrations',
    'content/assets/version_a/other',
  ])('does not intercept %s', async (path) => {
    const sw = worker();
    expect(await sw.get(path)).toBeUndefined();
    expect(sw.fetch).not.toHaveBeenCalled();
  });
  it('does not expose cached content to a request without a session', async () => {
    const sw = worker();
    await sw.get('content?v=version_a');
    expect(await sw.get('content?v=version_a', '')).toBeUndefined();
  });
  it('honours online refusals and never caches mutable responses', async () => {
    const sw = worker();
    await sw.get('content?v=version_a');
    sw.fetch.mockResolvedValue(new Response('Denied', { status: 403 }));
    expect((await sw.get('content?v=version_a'))!.status).toBe(403);
    sw.fetch.mockResolvedValue(new Response('draft', { headers: { 'cache-control': 'no-store' } }));
    await sw.get('content?v=version_b');
    expect(sw.stored.size).toBe(1);
    sw.fetch.mockRejectedValue(new TypeError('offline'));
    await expect(sw.get('content?v=version_b')).rejects.toThrow('offline');
  });
});
