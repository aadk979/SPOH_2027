import type { StampCardRequest, StampCardResponse } from '@spoh/shared';
import type { IssueCardRequest } from '@spoh/shared';
export async function issueCard(eventId: string, input: { code: string; body: IssueCardRequest }) {
  return (
    await eventApi<{ card: MissionCardRecord }>(
      eventId,
      `/cards/${encodeURIComponent(input.code)}/issue`,
      { method: 'POST', body: input.body },
    )
  ).card;
}
import { eventApi } from '@/shared/lib/eventApi';
import { apiBlob } from '@/shared/lib/api';
import { eventApiPath } from '@/shared/lib/eventApi';
import {
  CardPrintExportRecord,
  CardPrintExportListResponse,
  CardPrintExportDetailResponse,
  type GenerateCardBatchRequest,
  type GenerateCardBatchResponse,
  type MissionCardRecord,
  type PrintCardBatchRequest,
  type VoidCardRequest,
  type ReissueCardRequest,
  type ReissueCardResponse,
} from '@spoh/shared';
export function generateCardBatch(eventId: string, body: GenerateCardBatchRequest) {
  return eventApi<GenerateCardBatchResponse>(eventId, '/cards/batch', { method: 'POST', body });
}
export async function printCardBatch(eventId: string, body: PrintCardBatchRequest) {
  const result = await eventApi<{ data: unknown }>(eventId, '/cards/print', {
    method: 'POST',
    body,
  });
  return CardPrintExportRecord.parse(result.data);
}
export function downloadCardPrint(eventId: string, id: string) {
  return apiBlob(eventApiPath(eventId, `/cards/print/${encodeURIComponent(id)}`));
}
export async function listCardPrintExports(eventId: string, cursor?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return CardPrintExportListResponse.parse(
    await eventApi(eventId, `/cards/print?${query}`, { cache: 'no-store', signal }),
  );
}
export async function getCardPrintDetails(eventId: string, id: string, signal?: AbortSignal) {
  const response = CardPrintExportDetailResponse.parse(
    await eventApi(eventId, `/cards/print/${encodeURIComponent(id)}/details`, {
      cache: 'no-store',
      signal,
    }),
  );
  if (response.data.id !== id) throw new Error('This export is not the selected file.');
  return response.data;
}
export async function lookupCard(eventId: string, code: string) {
  return (
    await eventApi<{ card: MissionCardRecord }>(eventId, `/cards/${encodeURIComponent(code)}`)
  ).card;
}
export async function voidCard(eventId: string, change: { code: string; body: VoidCardRequest }) {
  return (
    await eventApi<{ card: MissionCardRecord }>(
      eventId,
      `/cards/${encodeURIComponent(change.code)}/void`,
      { method: 'POST', body: change.body },
    )
  ).card;
}
export function reissueCard(eventId: string, change: { code: string; body: ReissueCardRequest }) {
  return eventApi<ReissueCardResponse>(
    eventId,
    `/cards/${encodeURIComponent(change.code)}/reissue`,
    { method: 'POST', body: change.body },
  );
}
type StampInput = Omit<StampCardRequest, 'acknowledgeDuplicate'> & {
  acknowledgeDuplicate?: boolean;
};
export const cardEndpoints = {
  stamps: (shortCode: string) => `/cards/${shortCode}/stamps`,
} as const;
export function stampCard(
  eventId: string,
  shortCode: string,
  body: StampInput,
): Promise<StampCardResponse> {
  return eventApi<StampCardResponse>(eventId, cardEndpoints.stamps(shortCode), {
    method: 'POST',
    body,
  });
}
