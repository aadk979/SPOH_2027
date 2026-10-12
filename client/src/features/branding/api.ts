import { BrandingState, BrandingUpload, ErrorBody, PublicBranding, type BrandingUploadRequest, type BrandingVariant, type PublishBrandingRequest, type SaveBrandingRequest } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
import { apiBlob } from '@/shared/lib/api';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import { loadClientConfiguration } from '@/shared/lib/env';

/** Public links can name only the selected slug and this fixed resource family. */
export function publicBrandingUrl(path: string, input: { slug: string; apiBaseUrl: string }): string {
  const prefix = `/api/v1/public/events/${encodeURIComponent(input.slug)}/branding/`;
  const tail = path.startsWith(prefix) ? path.slice(prefix.length) : '';
  if (!/^(?:manifest\.webmanifest|theme\.css\?v=[A-Za-z0-9_-]+|assets\/[A-Za-z0-9_-]+\/(?:logo|icon-192|icon-512|maskable-512))$/.test(tail)) throw new Error('Invalid public branding location');
  return `${input.apiBaseUrl}${path}`;
}

export async function getPublicBranding(slug: string, signal: AbortSignal) {
  const env = await loadClientConfiguration();
  let response: Response;
  try { response = await fetch(`${env.apiBaseUrl}/api/v1/public/events/${encodeURIComponent(slug)}/branding`, { signal, credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' } }); }
  catch (cause) { throw new NetworkError(cause); }
  if (response.status === 404) return null;
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = ErrorBody.safeParse(body);
    throw error.success ? new ApiError(response.status, error.data.error) : new Error('Published identity is unavailable');
  }
  const result = PublicBranding.parse((body as { data?: unknown }).data);
  if (result.slug !== slug) throw new Error('Published identity belongs to another event');
  return result;
}
export async function getBranding(eventId: string, signal: AbortSignal) {
  const response = await eventApi<{ data: unknown }>(eventId, '/branding', { signal, cache: 'no-store' });
  const state = BrandingState.parse(response.data);
  if (state.eventId !== eventId) throw new Error('Branding belongs to another event');
  return state;
}
export async function saveBranding(eventId: string, body: SaveBrandingRequest) {
  const response = await eventApi<{ data: unknown }>(eventId, '/branding/draft', { method: 'PUT', body });
  return BrandingState.parse(response.data);
}
export async function publishBranding(eventId: string, body: PublishBrandingRequest) {
  const response = await eventApi<{ data: unknown }>(eventId, '/branding/publish', { method: 'POST', body });
  return BrandingState.parse(response.data);
}
export async function uploadBranding(eventId: string, input: { file: File; body: BrandingUploadRequest }) {
  const response = await eventApi<{ data: unknown }>(eventId, '/branding/images/upload', { method: 'POST', body: input.body });
  const receipt = BrandingUpload.parse(response.data);
  const form = new FormData();
  for (const [key, value] of Object.entries(receipt.fields)) form.append(key, value);
  form.append('file', input.file);
  const sent = await fetch(receipt.url, { method: 'POST', body: form, credentials: 'omit', redirect: 'error' });
  if (!sent.ok) throw new Error('The logo upload was not confirmed. Retry the same upload.');
  return receipt.receiptId;
}
export function getDraftBrandingImage(eventId: string, input: { variant: BrandingVariant; signal: AbortSignal }) {
  return apiBlob(`/events/${encodeURIComponent(eventId)}/branding/draft/assets/${input.variant}`, { signal: input.signal, cache: 'no-store' });
}
