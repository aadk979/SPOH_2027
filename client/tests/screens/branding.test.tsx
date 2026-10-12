import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { BrandingState, PublicBranding } from '@spoh/shared';
import { BrandingPanel } from '../../src/features/branding/components/BrandingPanel';
import { BrandingRoot } from '../../src/features/branding/components/BrandingRoot';
import { applyBrandingHead, clearBrandingHead } from '../../src/features/branding/model/head';
import { brandingSlug } from '../../src/features/branding/model/brandingPath';
import { ApiError } from '../../src/shared/lib/apiErrors';
const owner = vi.hoisted(() => ({ id: 'person-a', read: true, edit: true, publish: true, path: '/sign-in', returnTo: '/e/event-a/home' }));
const api = vi.hoisted(() => ({ get: vi.fn(), public: vi.fn(), save: vi.fn(), publish: vi.fn(), upload: vi.fn(), preview: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => owner.path, useSearchParams: () => new URLSearchParams({ returnTo: owner.returnTo }) }));
vi.mock('@/shared/lib/eventContext', () => ({ useEvent: () => ({ id: 'event-a', slug: 'event-a', name: 'Private event name', status: 'LIVE' }), useOptionalEvent: () => null }));
vi.mock('@/features/session', () => ({ useCurrentSession: () => ({ volunteerId: owner.id }), useAllows: () => (action: string) => action === 'Settings.Read' ? owner.read : action === 'Content.Edit' ? owner.edit : owner.publish }));
vi.mock('../../src/features/branding/api', async (original) => ({ ...await original<typeof import('../../src/features/branding/api')>(), getBranding: api.get, getPublicBranding: api.public, saveBranding: api.save, publishBranding: api.publish, uploadBranding: api.upload, getDraftBrandingImage: api.preview }));
const brand = (slug = 'event-a'): PublicBranding => ({ slug, name: `Public ${slug}`, accent: '#8844aa', publicationId: 'publication', publicationVersion: 1, logo: null, icons: [], themePath: `/api/v1/public/events/${slug}/branding/theme.css?v=publication`, manifestPath: `/api/v1/public/events/${slug}/branding/manifest.webmanifest` });
const state = (): BrandingState => ({ eventId: 'event-a', version: 1, draft: { accent: '#0066cc', logoAlt: null, uploadReceiptId: null }, published: null, registryRemaining: 32 });
function mount(child: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{child}</QueryClientProvider>) };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(owner, { id: 'person-a', read: true, edit: true, publish: true, path: '/sign-in', returnTo: '/e/event-a/home' });
  api.get.mockResolvedValue(state()); api.public.mockResolvedValue(brand());
  api.preview.mockResolvedValue(new Blob(['private logo'], { type: 'image/png' }));
});
afterEach(() => { cleanup(); clearBrandingHead(); });
it('validates a safe exact return-path slug and ignores external, encoded and malformed destinations', () => {
  expect(brandingSlug('/sign-in', '/e/event-a/home?x=1')).toBe('event-a');
  for (const path of ['https://external.test/e/event-a/home', '//external.test/e/event-a/home', '/e/event%2Fa/home', '/e/_/home', '/e/event-a\\home']) expect(brandingSlug('/sign-in', path)).toBeNull();
});
it('uses attributes/text content for head identity and restores neutral links without changing script bytes', () => {
  const script = document.createElement('script'); script.textContent = 'self.__next_f.push([1,"unchanged"]);'; document.head.append(script);
  const malicious = { ...brand(), name: '<img src=x onerror=alert(1)> & event' };
  applyBrandingHead(malicious, 'https://api.example.test');
  expect(document.title).toBe(malicious.name);
  expect(document.head.querySelector('img')).toBeNull();
  expect(document.head.querySelector<HTMLLinkElement>('link[data-event-branding]')?.crossOrigin).toBe('anonymous');
  expect(document.head.querySelector<HTMLLinkElement>('link[rel="stylesheet"][data-event-branding]')?.href).toBe('https://api.example.test/api/v1/public/events/event-a/branding/theme.css?v=publication');
  expect(document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href).toBe('https://api.example.test/api/v1/public/events/event-a/branding/manifest.webmanifest');
  expect(script.textContent).toBe('self.__next_f.push([1,"unchanged"]);');
  clearBrandingHead();
  expect(document.title).toBe('Volunteer operations');
  expect(document.head.querySelector('link[data-event-branding]')).toBeNull();
  expect(document.head.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href')).toBe('/manifest.json');
  script.remove();
});
it('clears event A immediately and ignores its late response after switching to B', async () => {
  let resolveA!: (value: PublicBranding) => void;
  api.public.mockImplementation((slug: string) => slug === 'event-a' ? new Promise<PublicBranding>((resolve) => { resolveA = resolve; }) : Promise.resolve(brand('event-b')));
  const view = mount(<BrandingRoot />);
  await waitFor(() => expect(api.public).toHaveBeenCalled());
  owner.returnTo = '/e/event-b/home';
  view.rerender(<QueryClientProvider client={view.client}><BrandingRoot /></QueryClientProvider>);
  await waitFor(() => expect(document.title).toBe('Public event-b'));
  await act(async () => resolveA(brand('event-a')));
  expect(document.title).toBe('Public event-b');
  expect(document.head.querySelector<HTMLLinkElement>('link[data-event-branding]')?.href).toContain('/event-b/');
});
it('hides draft fields on permission loss and on a failed current read with old cached data', async () => {
  const view = mount(<BrandingPanel />);
  await screen.findByLabelText('Accent colour');
  api.get.mockRejectedValue(new ApiError(403, { code: 'FORBIDDEN', message: 'Permission changed', requestId: 'brand-denied' }));
  await act(async () => { await view.client.invalidateQueries({ queryKey: ['event-a', 'branding'] }); });
  await screen.findByText('Request ID:', { exact: false });
  expect(screen.queryByLabelText('Accent colour')).toBeNull();
  owner.read = false;
  view.rerender(<QueryClientProvider client={view.client}><BrandingPanel /></QueryClientProvider>);
  expect(screen.getByText('Access unavailable')).toBeDefined();
});
it('validates the colour and freezes a public-publish confirmation at the saved version', async () => {
  api.publish.mockResolvedValue({ ...state(), version: 2, published: brand() });
  mount(<BrandingPanel />);
  const accent = await screen.findByLabelText('Accent colour');
  fireEvent.change(accent, { target: { value: 'unsafe' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save branding draft' }));
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.change(accent, { target: { value: '#0066cc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publish event branding' }));
  expect(api.publish).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeDefined();
  expect((accent as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Publish public identity' }));
  await waitFor(() => expect(api.publish).toHaveBeenCalledWith('event-a', { expectedVersion: 1, idempotencyKey: expect.any(String) }));
});
it('closes the confirmation and refuses publication after current publish permission is withdrawn', async () => {
  const view = mount(<BrandingPanel />);
  await screen.findByLabelText('Accent colour');
  fireEvent.click(screen.getByRole('button', { name: 'Publish event branding' }));
  owner.publish = false;
  view.rerender(<QueryClientProvider client={view.client}><BrandingPanel /></QueryClientProvider>);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(api.publish).not.toHaveBeenCalled();
});
it('revokes private preview URLs and aborts its requests when the owner changes', async () => {
  api.get.mockResolvedValue({ ...state(), draft: { accent: '#0066cc', logoAlt: 'Private mark', uploadReceiptId: 'saved-receipt' } });
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:private-logo');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const view = mount(<BrandingPanel />);
  await waitFor(() => expect(create).toHaveBeenCalledTimes(4));
  const signals = api.preview.mock.calls.map((call) => call[1].signal as AbortSignal);
  owner.id = 'person-b';
  view.rerender(<QueryClientProvider client={view.client}><BrandingPanel /></QueryClientProvider>);
  await waitFor(() => expect(revoke).toHaveBeenCalled());
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});
