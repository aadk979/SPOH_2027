import type { CreateUploadRequest, CreateUploadResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export function getMediaConfig(eventId: string): Promise<{ enabled: boolean }> {
  return eventApi<{ enabled: boolean }>(eventId, '/media/config');
}
export function createUpload(
  eventId: string,
  body: CreateUploadRequest,
): Promise<CreateUploadResponse> {
  return eventApi<CreateUploadResponse>(eventId, '/media/uploads', { method: 'POST', body });
}
export async function uploadFile(policy: CreateUploadResponse, file: File): Promise<void> {
  // S3 reads fields in order: the file must follow the signed policy fields.
  const form = new FormData();
  for (const [name, value] of Object.entries(policy.fields)) form.append(name, value);
  form.append('file', file);
  // This presigned upload deliberately carries no application bearer token.
  const response = await fetch(policy.url, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`upload rejected with ${response.status}`);
}
