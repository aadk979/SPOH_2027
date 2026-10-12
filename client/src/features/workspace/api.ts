import { EntityRef, EntityResponse, RecordsRequest, RecordsResponse, SearchRequest, SearchResponse,
  UndoCaptureImportRequest, UndoCaptureImportResponse, VoidGiftRedemptionRequest, VoidGiftRedemptionResponse } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

function params(input: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.toString();
}

export async function readEntity(eventId: string, input: EntityRef, signal?: AbortSignal) {
  const { via, ...ref } = EntityRef.parse(input);
  const query = params({ ...ref, ...(via ? { via: via.kind, assignmentId: via.assignmentId } : {}) });
  return EntityResponse.parse(await eventApi(eventId, `/workspace/entity?${query}`, { signal, cache: 'no-store' }));
}

export async function readRecords(eventId: string, input: RecordsRequest, signal?: AbortSignal) {
  const { filter, ...paging } = RecordsRequest.parse(input);
  const query = params({ ...filter, ...paging });
  return RecordsResponse.parse(await eventApi(eventId, `/workspace/records?${query}`, { signal, cache: 'no-store' }));
}

export async function searchWorkspace(eventId: string, input: SearchRequest, signal?: AbortSignal) {
  const query = params(SearchRequest.parse(input));
  return SearchResponse.parse(await eventApi(eventId, `/workspace/search?${query}`, { signal, cache: 'no-store' }));
}

export interface RetainedCorrection {
  kind: 'redemption' | 'import';
  id: string;
  body: VoidGiftRedemptionRequest;
}
export async function correctRetainedRecord(eventId: string, input: RetainedCorrection) {
  const id = encodeURIComponent(input.id);
  if (input.kind === 'redemption') return VoidGiftRedemptionResponse.parse(
    await eventApi(eventId, `/gifts/redemptions/${id}/void`, { method: 'POST', body: VoidGiftRedemptionRequest.parse(input.body) }));
  return UndoCaptureImportResponse.parse(await eventApi(eventId, `/fallback/imports/${id}/undo`,
    { method: 'POST', body: UndoCaptureImportRequest.parse(input.body) }));
}
