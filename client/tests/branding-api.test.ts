import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getPublicBranding, publicBrandingUrl } from '../src/features/branding/api';
const fetcher = vi.fn();
beforeEach(() => { fetcher.mockReset(); vi.stubGlobal('fetch', fetcher); });
afterEach(() => { vi.unstubAllGlobals(); });
it('fetches public identity without credentials/bearer or session renewal and treats 404 as neutral', async () => {
  fetcher.mockResolvedValue(new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }));
  const signal = new AbortController().signal;
  expect(await getPublicBranding('event-a', signal)).toBeNull();
  expect(fetcher).toHaveBeenCalledWith('http://localhost:4010/api/v1/public/events/event-a/branding', expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store', signal, headers: { Accept: 'application/json' } }));
  fetcher.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Unavailable', requestId: 'public-failed' } }), { status: 503 }));
  await expect(getPublicBranding('event-a', signal)).rejects.toMatchObject({ status: 503, requestId: 'public-failed' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('refuses private, external, cross-event and arbitrary publication resource paths', () => {
  const input = { slug: 'event-a', apiBaseUrl: 'https://api.example.test' };
  expect(publicBrandingUrl('/api/v1/public/events/event-a/branding/theme.css?v=publication', input)).toBe('https://api.example.test/api/v1/public/events/event-a/branding/theme.css?v=publication');
  expect(publicBrandingUrl('/api/v1/public/events/event-a/branding/manifest.webmanifest', input)).toBe('https://api.example.test/api/v1/public/events/event-a/branding/manifest.webmanifest');
  for (const variant of ['logo', 'icon-192', 'icon-512', 'maskable-512']) {
    expect(publicBrandingUrl(`/api/v1/public/events/event-a/branding/assets/publication/${variant}`, input)).toBe(`https://api.example.test/api/v1/public/events/event-a/branding/assets/publication/${variant}`);
  }
  for (const path of ['https://external.test/style.css', '/api/v1/public/events/event-b/branding/manifest.webmanifest', '/api/v1/events/event-a/content/draft', '/api/v1/public/events/event-a/branding/assets/publication/arbitrary', '/api/v1/public/events/event-a/branding/theme.css?v=pub&private=1']) expect(() => publicBrandingUrl(path, input)).toThrow();
});
